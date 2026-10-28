package plugin

import (
	"fmt"
	"maps"
	"net/http"
	"net/netip"
	"regexp"
	"slices"
	"strconv"
	"strings"
)

func init() {
	register(ipRestriction)
	register(cors)
	register(maintenance)
	register(bodyLimit)
	register(mock)
	register(requestRewrite)
}

const ipListSchema = `{"type":"array","maxItems":500,"items":{"type":"string","maxLength":50}}`

func parsePrefixes(entries []string) ([]netip.Prefix, error) {
	prefixes := make([]netip.Prefix, 0, len(entries))
	for _, entry := range entries {
		entry = strings.TrimSpace(entry)
		prefix, err := netip.ParsePrefix(entry)
		if err != nil {
			addr, addrErr := netip.ParseAddr(entry)
			if addrErr != nil {
				return nil, fmt.Errorf("%q is not an IP or CIDR", entry)
			}
			prefix = netip.PrefixFrom(addr, addr.BitLen())
		}
		prefixes = append(prefixes, prefix.Masked())
	}
	return prefixes, nil
}

func inPrefixes(prefixes []netip.Prefix, addr netip.Addr) bool {
	for _, prefix := range prefixes {
		if prefix.Contains(addr) {
			return true
		}
	}
	return false
}

// ip-restriction: deny wins; a non-empty allow list admits only its entries.
var ipRestriction = define("ip-restriction", 1000, `{"type":"object","additionalProperties":false,"properties":{
	"allow":`+ipListSchema+`,"deny":`+ipListSchema+`}}`,
	func(c struct {
		Allow []string `json:"allow"`
		Deny  []string `json:"deny"`
	}, _ Scope) (Instance, error) {
		allow, err := parsePrefixes(c.Allow)
		if err != nil {
			return nil, err
		}
		deny, err := parsePrefixes(c.Deny)
		if err != nil {
			return nil, err
		}
		return &ipFilter{allow: allow, deny: deny}, nil
	})

type ipFilter struct{ allow, deny []netip.Prefix }

func (f *ipFilter) Request(ctx *Context) *Reply {
	if inPrefixes(f.deny, ctx.ClientIP) || (len(f.allow) > 0 && !inPrefixes(f.allow, ctx.ClientIP)) {
		return Fail(http.StatusForbidden, "当前网络不允许访问", "Access Denied By IP Control")
	}
	return nil
}

var cors = define("cors", 950, `{"type":"object","additionalProperties":false,"required":["allowOrigins"],"properties":{
	"allowOrigins":{"type":"array","maxItems":100,"items":{"type":"string","maxLength":200}},
	"allowMethods":{"type":"array","maxItems":20,"items":{"type":"string","maxLength":10}},
	"allowHeaders":{"type":"array","maxItems":50,"items":{"type":"string","maxLength":100}},
	"exposeHeaders":{"type":"array","maxItems":50,"items":{"type":"string","maxLength":100}},
	"allowCredentials":{"type":"boolean"},
	"maxAge":{"type":"integer","minimum":0,"maximum":86400}}}`,
	func(c struct {
		AllowOrigins     []string `json:"allowOrigins"`
		AllowMethods     []string `json:"allowMethods"`
		AllowHeaders     []string `json:"allowHeaders"`
		ExposeHeaders    []string `json:"exposeHeaders"`
		AllowCredentials bool     `json:"allowCredentials"`
		MaxAge           int      `json:"maxAge"`
	}, _ Scope) (Instance, error) {
		p := &corsPolicy{origins: map[string]bool{}, credentials: c.AllowCredentials,
			methods: strings.Join(c.AllowMethods, ", "), headers: strings.Join(c.AllowHeaders, ", "),
			expose: strings.Join(c.ExposeHeaders, ", ")}
		for _, origin := range c.AllowOrigins {
			p.origins[strings.TrimSuffix(origin, "/")] = true
		}
		if p.methods == "" {
			p.methods = "GET, POST, PUT, PATCH, DELETE, OPTIONS"
		}
		if c.MaxAge > 0 {
			p.maxAge = strconv.Itoa(c.MaxAge)
		}
		return p, nil
	})

type corsPolicy struct {
	origins                          map[string]bool
	credentials                      bool
	methods, headers, expose, maxAge string
}

func (p *corsPolicy) Request(ctx *Context) *Reply {
	origin := ctx.Request.Header.Get("Origin")
	if origin == "" {
		return nil
	}
	ctx.Header.Add("Vary", "Origin")
	if !p.origins[origin] && !p.origins["*"] {
		return nil // the browser enforces the missing grant
	}
	allowed := origin
	if p.origins["*"] && !p.credentials {
		allowed = "*"
	}
	ctx.Header.Set("Access-Control-Allow-Origin", allowed)
	if p.credentials {
		ctx.Header.Set("Access-Control-Allow-Credentials", "true")
	}
	if p.expose != "" {
		ctx.Header.Set("Access-Control-Expose-Headers", p.expose)
	}
	if ctx.Request.Method != http.MethodOptions || ctx.Request.Header.Get("Access-Control-Request-Method") == "" {
		return nil
	}
	header := http.Header{"Access-Control-Allow-Methods": {p.methods}}
	if p.headers != "" {
		header.Set("Access-Control-Allow-Headers", p.headers)
	} else if requested := ctx.Request.Header.Get("Access-Control-Request-Headers"); requested != "" {
		header.Set("Access-Control-Allow-Headers", requested)
	}
	if p.maxAge != "" {
		header.Set("Access-Control-Max-Age", p.maxAge)
	}
	return &Reply{Status: http.StatusNoContent, Header: header, Body: []byte{}}
}

// Response drops the upstream's own CORS headers so the policy is the only source.
func (p *corsPolicy) Response(ctx *Context) *Reply {
	for key := range ctx.ResponseHeader {
		if strings.HasPrefix(key, "Access-Control-") {
			ctx.ResponseHeader.Del(key)
		}
	}
	return nil
}

var maintenance = define("maintenance", 900, `{"type":"object","additionalProperties":false,"properties":{
	"status":{"type":"integer","minimum":200,"maximum":599},
	"message":{"type":"string","maxLength":200},
	"allowIPs":`+ipListSchema+`}}`,
	func(c struct {
		Status   int      `json:"status"`
		Message  string   `json:"message"`
		AllowIPs []string `json:"allowIPs"`
	}, _ Scope) (Instance, error) {
		allow, err := parsePrefixes(c.AllowIPs)
		if err != nil {
			return nil, err
		}
		reply := Fail(orInt(c.Status, http.StatusServiceUnavailable), orString(c.Message, "系统维护中，请稍后再试"), "Under maintenance")
		return &maintenanceMode{allow: allow, reply: reply}, nil
	})

type maintenanceMode struct {
	allow []netip.Prefix
	reply *Reply
}

func (m *maintenanceMode) Request(ctx *Context) *Reply {
	if inPrefixes(m.allow, ctx.ClientIP) {
		return nil
	}
	return m.reply
}

var bodyLimit = define("body-limit", 850, `{"type":"object","additionalProperties":false,"required":["maxBytes"],"properties":{
	"maxBytes":{"type":"integer","minimum":1,"maximum":1073741824}}}`,
	func(c struct {
		MaxBytes int64 `json:"maxBytes"`
	}, _ Scope) (Instance, error) {
		return &limitBody{max: c.MaxBytes}, nil
	})

type limitBody struct{ max int64 }

// TooLarge is the reply for bodies over the limit, also when found mid-stream.
var TooLarge = Fail(http.StatusRequestEntityTooLarge, "请求内容过大", "Request body too large")

func (l *limitBody) Request(ctx *Context) *Reply {
	if ctx.Request.ContentLength > l.max {
		return TooLarge
	}
	if ctx.Request.Body != nil && ctx.Request.Body != http.NoBody {
		ctx.Request.Body = http.MaxBytesReader(nil, ctx.Request.Body, l.max)
	}
	return nil
}

var mock = define("mock", 100, `{"type":"object","additionalProperties":false,"properties":{
	"status":{"type":"integer","minimum":200,"maximum":599},
	"contentType":{"type":"string","maxLength":100},
	"headers":{"type":"object","additionalProperties":{"type":"string","maxLength":1000}},
	"body":{"type":"string","maxLength":1048576}}}`,
	func(c struct {
		Status      int               `json:"status"`
		ContentType string            `json:"contentType"`
		Headers     map[string]string `json:"headers"`
		Body        string            `json:"body"`
	}, _ Scope) (Instance, error) {
		header := http.Header{}
		for key, value := range c.Headers {
			header.Set(key, value)
		}
		return &fixed{&Reply{Status: orInt(c.Status, http.StatusOK), Header: header, Body: []byte(c.Body),
			ContentType: orString(c.ContentType, "application/json; charset=utf-8")}}, nil
	})

type fixed struct{ reply *Reply }

func (f *fixed) Request(*Context) *Reply { return f.reply }

// request-rewrite covers Aliyun's parameter mapping, constants and system
// parameters: values may use {clientIp}, {requestId}, {consumer}, {user} and {stage}.
var requestRewrite = define("request-rewrite", 200, `{"type":"object","additionalProperties":false,"properties":{
	"setHeaders":{"type":"object","additionalProperties":{"type":"string","maxLength":1000}},
	"removeHeaders":{"type":"array","items":{"type":"string","maxLength":100}},
	"setQuery":{"type":"object","additionalProperties":{"type":"string","maxLength":1000}},
	"removeQuery":{"type":"array","items":{"type":"string","maxLength":100}},
	"path":{"type":"object","additionalProperties":false,"required":["match","replace"],"properties":{
		"match":{"type":"string","maxLength":500},"replace":{"type":"string","maxLength":500}}},
	"responseSetHeaders":{"type":"object","additionalProperties":{"type":"string","maxLength":1000}},
	"responseRemoveHeaders":{"type":"array","items":{"type":"string","maxLength":100}}}}`,
	func(c struct {
		SetHeaders    map[string]string `json:"setHeaders"`
		RemoveHeaders []string          `json:"removeHeaders"`
		SetQuery      map[string]string `json:"setQuery"`
		RemoveQuery   []string          `json:"removeQuery"`
		Path          *struct {
			Match   string `json:"match"`
			Replace string `json:"replace"`
		} `json:"path"`
		ResponseSetHeaders    map[string]string `json:"responseSetHeaders"`
		ResponseRemoveHeaders []string          `json:"responseRemoveHeaders"`
	}, _ Scope) (Instance, error) {
		for _, headers := range [][]string{slices.Collect(maps.Keys(c.SetHeaders)), c.RemoveHeaders,
			slices.Collect(maps.Keys(c.ResponseSetHeaders)), c.ResponseRemoveHeaders} {
			for _, key := range headers {
				if framing[http.CanonicalHeaderKey(key)] {
					return nil, fmt.Errorf("header %s frames the message and cannot be rewritten", key)
				}
			}
		}
		r := &rewriter{setHeaders: c.SetHeaders, removeHeaders: c.RemoveHeaders, setQuery: c.SetQuery,
			removeQuery: c.RemoveQuery, responseSet: c.ResponseSetHeaders, responseRemove: c.ResponseRemoveHeaders}
		if c.Path != nil {
			match, err := regexp.Compile(c.Path.Match)
			if err != nil {
				return nil, fmt.Errorf("path.match: %w", err)
			}
			r.path, r.replace = match, c.Path.Replace
		}
		return r, nil
	})

// framing headers are owned by the HTTP stack; rewriting them would corrupt the exchange.
var framing = map[string]bool{"Content-Length": true, "Transfer-Encoding": true, "Connection": true,
	"Keep-Alive": true, "Upgrade": true, "Te": true, "Trailer": true, "Host": true}

type rewriter struct {
	setHeaders, setQuery, responseSet map[string]string
	removeHeaders, removeQuery        []string
	responseRemove                    []string
	path                              *regexp.Regexp
	replace                           string
}

func expand(value string, ctx *Context) string {
	if !strings.Contains(value, "{") {
		return value
	}
	return strings.NewReplacer("{clientIp}", ctx.ClientIP.String(), "{requestId}", ctx.RequestID,
		"{consumer}", ctx.Consumer, "{user}", ctx.User, "{stage}", ctx.Stage).Replace(value)
}

func (r *rewriter) Request(ctx *Context) *Reply {
	req := ctx.Request
	for _, key := range r.removeHeaders {
		req.Header.Del(key)
	}
	for key, value := range r.setHeaders {
		req.Header.Set(key, expand(value, ctx))
	}
	if len(r.setQuery) > 0 || len(r.removeQuery) > 0 {
		query := req.URL.Query()
		for _, key := range r.removeQuery {
			query.Del(key)
		}
		for key, value := range r.setQuery {
			query.Set(key, expand(value, ctx))
		}
		req.URL.RawQuery = query.Encode()
	}
	if r.path != nil {
		req.URL.Path = r.path.ReplaceAllString(req.URL.Path, r.replace)
		req.URL.RawPath = ""
	}
	return nil
}

func (r *rewriter) Response(ctx *Context) *Reply {
	if ctx.ResponseHeader == nil {
		return nil
	}
	for _, key := range r.responseRemove {
		ctx.ResponseHeader.Del(key)
	}
	for key, value := range r.responseSet {
		ctx.ResponseHeader.Set(key, expand(value, ctx))
	}
	return nil
}

func orInt(value, fallback int) int {
	if value == 0 {
		return fallback
	}
	return value
}

func orString(value, fallback string) string {
	if value == "" {
		return fallback
	}
	return value
}

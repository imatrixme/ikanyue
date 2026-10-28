package pay

import (
	"bytes"
	"crypto/sha1"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"slices"
	"strings"
	"unicode/utf8"
)

const wechatOrigin = "https://api.mch.weixin.qq.com"

// WechatClient signs API v3 requests and trusts only responses signed by a pinned platform key.
type WechatClient struct {
	Credentials *Credentials
	Transport   Transport
	Mock        bool
}

func sameOrigin(target *url.URL) bool {
	return target.Scheme+"://"+target.Host == wechatOrigin && target.User == nil && target.Fragment == ""
}

func (c *WechatClient) response(path, method string, body any) (*http.Response, error) {
	base, _ := url.Parse(wechatOrigin)
	target, err := base.Parse(path)
	if err != nil || !sameOrigin(target) {
		return nil, fail("WECHAT_ORIGIN_FORBIDDEN", 400)
	}
	raw := ""
	if body != nil {
		raw = string(jsonBytes(body))
	}
	var reader io.Reader
	if method != http.MethodGet {
		reader = strings.NewReader(raw)
	}
	request, err := http.NewRequest(method, target.String(), reader)
	if err != nil {
		return nil, err
	}
	request.Header.Set("Authorization", authorization(method, target, raw, c.Credentials))
	request.Header.Set("Accept", "application/json")
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("User-Agent", "kanyue.pay/0.1")
	return c.Transport(request)
}

func boundedBody(response *http.Response, limit int64) ([]byte, error) {
	if response.Body == nil {
		return nil, nil
	}
	defer response.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(response.Body, limit+1))
	if err != nil {
		return nil, err
	}
	if int64(len(raw)) > limit {
		return nil, fail("WECHAT_RESPONSE_TOO_LARGE", 502)
	}
	return raw, nil
}

// request returns the verified JSON body. Even errors are untrusted: an
// unsigned error must never release money.
func (c *WechatClient) request(path, method string, body any) (any, error) {
	response, err := c.response(path, method, body)
	if err != nil {
		return nil, err
	}
	bytes, err := boundedBody(response, 65536)
	if err != nil {
		return nil, err
	}
	if !utf8.Valid(bytes) {
		return nil, errors.New("WECHAT_RESPONSE_NOT_UTF8")
	}
	raw := string(bytes)
	if err := verifyResponse(response.Header, raw, c.Credentials.PublicKeys, seconds()); err != nil {
		return nil, err
	}
	if response.StatusCode < 200 || response.StatusCode > 299 {
		code := "UNKNOWN"
		var parsed map[string]any
		if json.Unmarshal(bytes, &parsed) == nil {
			if value, ok := parsed["code"].(string); ok {
				code = value
			}
		}
		return nil, &Error{Code: "WECHAT_REQUEST_UNRESOLVED", Status: 503, Channel: code, ChannelStatus: response.StatusCode}
	}
	if raw == "" {
		return map[string]any{}, nil
	}
	var value any
	if err := json.Unmarshal(bytes, &value); err != nil {
		return nil, fail("INVALID_JSON", 400)
	}
	return value, nil
}

type Bill struct {
	Date    string `json:"date"`
	Hash    string `json:"hash"`
	Content string `json:"content"`
	Mock    bool   `json:"mock"`
}

var sha1Pattern = regexp.MustCompile(`^[a-fA-F0-9]{40}$`)

// Bill downloads the ALL trade bill; the body is unsigned, so its hash comes from signed metadata.
func (c *WechatClient) Bill(date string) (Bill, error) {
	if !validDate(date) {
		return Bill{}, fail("INVALID_BILL_DATE", 400)
	}
	value, err := c.request("/v3/bill/tradebill?bill_date="+date+"&bill_type=ALL", http.MethodGet, nil)
	if err != nil {
		return Bill{}, err
	}
	metadata := mapOf(value)
	download, err := url.Parse(str(metadata, "download_url"))
	if err != nil || !download.IsAbs() {
		return Bill{}, errors.New("WECHAT_BILL_URL_INVALID")
	}
	if !sameOrigin(download) || !slices.Contains([]string{"/v3/billdownload/file", "/v3/bill/downloadurl"}, download.Path) {
		return Bill{}, fail("WECHAT_BILL_URL_FORBIDDEN", 400)
	}
	hash := str(metadata, "hash_value")
	if metadata["hash_type"] != "SHA1" || !sha1Pattern.MatchString(hash) {
		return Bill{}, fail("WECHAT_BILL_HASH_UNSUPPORTED", 400)
	}
	response, err := c.response(download.String(), http.MethodGet, nil)
	if err != nil {
		return Bill{}, err
	}
	if response.StatusCode < 200 || response.StatusCode > 299 {
		response.Body.Close()
		return Bill{}, fail("WECHAT_BILL_UNAVAILABLE", 503)
	}
	content, err := boundedBody(response, 1024*1024)
	if err != nil {
		return Bill{}, err
	}
	sum := sha1.Sum(content)
	if hex.EncodeToString(sum[:]) != strings.ToLower(hash) {
		return Bill{}, fail("WECHAT_BILL_HASH_MISMATCH", 502)
	}
	if !utf8.Valid(content) {
		return Bill{}, errors.New("WECHAT_BILL_NOT_UTF8")
	}
	return Bill{Date: date, Hash: hash, Content: string(content), Mock: c.Mock}, nil
}

func newResponse(status int, header http.Header, body string) *http.Response {
	return &http.Response{StatusCode: status, Header: header, Body: io.NopCloser(bytes.NewBufferString(body))}
}

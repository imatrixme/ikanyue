package telemetry

import (
	"net/netip"
	"regexp"
	"strings"

	"kanyue.gateway/internal/proxy"
)

// Logs never hold headers, cookies, query strings or bodies; the proxy entry
// carries none of them. What remains is scrubbed of personal data that can sit
// in a path: phone numbers, ID card numbers and email addresses.
var personal = []struct {
	pattern *regexp.Regexp
	mask    string
}{
	{regexp.MustCompile(`[^/@\s]+@[^/@\s]+\.[A-Za-z]{2,}`), "{email}"},
	{regexp.MustCompile(`\b\d{17}[\dXx]\b`), "{idcard}"},
	{regexp.MustCompile(`\b1[3-9]\d{9}\b`), "{phone}"},
}

func redactPath(path string) string {
	if i := strings.IndexAny(path, "?#"); i >= 0 {
		path = path[:i]
	}
	for _, p := range personal {
		path = p.pattern.ReplaceAllString(path, p.mask)
	}
	return path
}

// truncateIP keeps the network of an address: /24 for IPv4, /48 for IPv6.
func truncateIP(ip string) string {
	addr, err := netip.ParseAddr(ip)
	if err != nil {
		return ""
	}
	bits := 48
	if addr.Is4() || addr.Is4In6() {
		addr, bits = addr.Unmap(), 24
	}
	prefix, _ := addr.Prefix(bits)
	return prefix.Addr().String()
}

func redact(e proxy.Entry, truncate bool) Record {
	ip := e.ClientIP
	if truncate {
		ip = truncateIP(ip)
	}
	return Record{Time: e.Time, Kind: "request", Host: e.Host, Stage: e.Stage, Route: e.Route, Operation: e.Operation,
		Service: e.Service, Instance: e.Instance, Method: e.Method, Path: redactPath(e.Path), Status: e.Status,
		DurationMs: float64(e.Duration) / 1e6, BytesIn: e.BytesIn, BytesOut: e.BytesOut, ClientIP: ip,
		Consumer: e.Consumer, TraceID: e.TraceID, RequestID: e.RequestID, Error: e.Error}
}

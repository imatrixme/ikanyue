package telemetry

import (
	"fmt"
	"io"
	"math"
	"sort"
	"strconv"
	"strings"
)

// Exposition writes the Prometheus text format (version 0.0.4). Each family is
// declared once, before its first sample.
type Exposition struct {
	w        io.Writer
	declared map[string]bool
}

func NewExposition(w io.Writer) *Exposition {
	return &Exposition{w: w, declared: map[string]bool{}}
}

// Family declares a metric family: kind is counter, gauge or histogram.
func (x *Exposition) Family(name, kind, help string) {
	if x.declared[name] {
		return
	}
	x.declared[name] = true
	fmt.Fprintf(x.w, "# HELP %s %s\n# TYPE %s %s\n", name, help, name, kind)
}

// Sample writes one sample; labels are name, value pairs.
func (x *Exposition) Sample(name string, value float64, labels ...string) {
	var b strings.Builder
	b.WriteString(name)
	if len(labels) > 0 {
		b.WriteByte('{')
		for i := 0; i+1 < len(labels); i += 2 {
			if i > 0 {
				b.WriteByte(',')
			}
			b.WriteString(labels[i])
			b.WriteString(`="`)
			b.WriteString(labelEscaper.Replace(labels[i+1]))
			b.WriteByte('"')
		}
		b.WriteByte('}')
	}
	b.WriteByte(' ')
	b.WriteString(formatValue(value))
	b.WriteByte('\n')
	io.WriteString(x.w, b.String())
}

var labelEscaper = strings.NewReplacer(`\`, `\\`, `"`, `\"`, "\n", `\n`)

func formatValue(value float64) string {
	switch {
	case math.IsInf(value, 1):
		return "+Inf"
	case math.IsInf(value, -1):
		return "-Inf"
	}
	return strconv.FormatFloat(value, 'g', -1, 64)
}

// WritePrometheus writes the request counters since start, per environment, group,
// API and service, with the latency histogram, the drops and the exports' state.
// Counters restart at zero with the process, as Prometheus expects.
func (t *Telemetry) WritePrometheus(x *Exposition) {
	t.mu.Lock()
	keys := make([]metricKey, 0, len(t.totals))
	totals := make(map[metricKey]series, len(t.totals))
	for key, s := range t.totals {
		keys = append(keys, key)
		copied := *s
		copied.Buckets = append([]int(nil), s.Buckets...)
		totals[key] = copied
	}
	t.mu.Unlock()
	sort.Slice(keys, func(i, j int) bool {
		a, b := keys[i], keys[j]
		return a.stage+"\x00"+a.group+"\x00"+a.route+"\x00"+a.service < b.stage+"\x00"+b.group+"\x00"+b.route+"\x00"+b.service
	})

	x.Family("kanyue_gateway_requests_total", "counter", "Requests served, by status class.")
	for _, key := range keys {
		s := totals[key]
		labels := []string{"stage", key.stage, "group", key.group, "api", key.route, "service", key.service}
		other := s.Count - s.S2xx - s.S3xx - s.S4xx - s.S5xx
		for _, class := range []struct {
			code  string
			count int
		}{{"2xx", s.S2xx}, {"3xx", s.S3xx}, {"4xx", s.S4xx}, {"5xx", s.S5xx}, {"other", other}} {
			if class.count > 0 {
				x.Sample("kanyue_gateway_requests_total", float64(class.count), append(labels, "code", class.code)...)
			}
		}
	}
	x.Family("kanyue_gateway_request_duration_seconds", "histogram", "Time from the request reaching the gateway to the response finishing.")
	for _, key := range keys {
		s := totals[key]
		labels := []string{"stage", key.stage, "group", key.group, "api", key.route, "service", key.service}
		seen := 0
		for i, bound := range Bounds {
			seen += s.Buckets[i]
			x.Sample("kanyue_gateway_request_duration_seconds_bucket", float64(seen), append(labels, "le", formatValue(bound/1000))...)
		}
		x.Sample("kanyue_gateway_request_duration_seconds_bucket", float64(s.Count), append(labels, "le", "+Inf")...)
		x.Sample("kanyue_gateway_request_duration_seconds_sum", s.SumMs/1000, labels...)
		x.Sample("kanyue_gateway_request_duration_seconds_count", float64(s.Count), labels...)
	}
	x.Family("kanyue_gateway_received_bytes_total", "counter", "Request body bytes received from clients.")
	x.Family("kanyue_gateway_sent_bytes_total", "counter", "Response bytes sent to clients.")
	for _, key := range keys {
		s := totals[key]
		labels := []string{"stage", key.stage, "group", key.group, "api", key.route, "service", key.service}
		x.Sample("kanyue_gateway_received_bytes_total", float64(s.BytesIn), labels...)
		x.Sample("kanyue_gateway_sent_bytes_total", float64(s.BytesOut), labels...)
	}

	x.Family("kanyue_gateway_log_dropped_total", "counter", "Request log entries dropped because the log queue was full.")
	x.Sample("kanyue_gateway_log_dropped_total", float64(t.Dropped()))
	x.Family("kanyue_gateway_telemetry_bytes", "gauge", "Size of the telemetry database on disk, write-ahead log included.")
	x.Sample("kanyue_gateway_telemetry_bytes", float64(t.Bytes()))
	x.Family("kanyue_gateway_export_dropped_total", "counter", "Records an export dropped.")
	x.Family("kanyue_gateway_export_failing", "gauge", "1 while an export's target keeps failing.")
	x.Family("kanyue_gateway_export_queued", "gauge", "Records waiting to be exported.")
	for _, status := range t.Exports() {
		failing := 0.0
		if !status.FailingSince.IsZero() {
			failing = 1
		}
		x.Sample("kanyue_gateway_export_dropped_total", float64(status.Dropped), "exporter", status.Name)
		x.Sample("kanyue_gateway_export_failing", failing, "exporter", status.Name)
		x.Sample("kanyue_gateway_export_queued", float64(status.Queued), "exporter", status.Name)
	}
}

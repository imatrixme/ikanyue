package telemetry

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

// OTLPTraces sends request records as server spans in OTLP/HTTP JSON, e.g. to an
// OpenTelemetry Collector at http://collector:4318/v1/traces. Each span is the
// gateway's hop: the upstream continues it through traceparent, and a caller's
// span is its parent. Audit and alert events are not traces and are skipped.
type OTLPTraces struct {
	URL string
	// Username with Password is Basic auth; Token alone is a Bearer token.
	Username, Password, Token string
	Client                    *http.Client
}

type otlpValue struct {
	StringValue *string `json:"stringValue,omitempty"`
	IntValue    *string `json:"intValue,omitempty"`
}

type otlpAttribute struct {
	Key   string    `json:"key"`
	Value otlpValue `json:"value"`
}

type otlpSpan struct {
	TraceID           string          `json:"traceId"`
	SpanID            string          `json:"spanId"`
	ParentSpanID      string          `json:"parentSpanId,omitempty"`
	Name              string          `json:"name"`
	Kind              int             `json:"kind"`
	StartTimeUnixNano string          `json:"startTimeUnixNano"`
	EndTimeUnixNano   string          `json:"endTimeUnixNano"`
	Attributes        []otlpAttribute `json:"attributes"`
	Status            struct {
		Code    int    `json:"code,omitempty"`
		Message string `json:"message,omitempty"`
	} `json:"status"`
}

const (
	spanKindServer  = 2
	spanStatusError = 2
)

func text(key, value string) otlpAttribute {
	return otlpAttribute{Key: key, Value: otlpValue{StringValue: &value}}
}

func integer(key string, value int64) otlpAttribute {
	s := strconv.FormatInt(value, 10)
	return otlpAttribute{Key: key, Value: otlpValue{IntValue: &s}}
}

// span is r as a server span; ok is false for records without a trace.
func span(r Record) (otlpSpan, bool) {
	if r.Kind != "request" && r.Kind != "probe" || len(r.TraceID) != 32 || len(r.SpanID) != 16 {
		return otlpSpan{}, false
	}
	name := r.Operation
	if name == "" {
		name = r.Method
	}
	start := r.Time.UnixNano()
	s := otlpSpan{TraceID: r.TraceID, SpanID: r.SpanID, ParentSpanID: r.ParentSpanID, Name: name, Kind: spanKindServer,
		StartTimeUnixNano: strconv.FormatInt(start, 10),
		EndTimeUnixNano:   strconv.FormatInt(start+int64(r.DurationMs*1e6), 10)}
	if r.Kind == "probe" {
		s.Name = r.Message
	}
	add := func(key, value string) {
		if value != "" {
			s.Attributes = append(s.Attributes, text(key, value))
		}
	}
	add("http.request.method", r.Method)
	add("url.path", r.Path)
	if _, route, found := strings.Cut(r.Operation, " "); found {
		add("http.route", route)
	} else {
		add("http.route", r.Operation)
	}
	if r.Status > 0 {
		s.Attributes = append(s.Attributes, integer("http.response.status_code", int64(r.Status)))
	}
	add("server.address", r.Host)
	add("client.address", r.ClientIP)
	add("kanyue.stage", r.Stage)
	add("kanyue.group", r.Group)
	add("kanyue.api", r.Route)
	add("kanyue.service", r.Service)
	add("kanyue.instance", r.Instance)
	add("kanyue.consumer", r.Consumer)
	add("kanyue.request_id", r.RequestID)
	// Client errors are the caller's; a server span fails on 5xx and on gateway errors.
	if r.Status >= 500 || r.Status == 0 && r.Kind == "request" {
		s.Status.Code, s.Status.Message = spanStatusError, r.Error
	}
	return s, true
}

func (o *OTLPTraces) Export(ctx context.Context, batch []Record) error {
	var spans []otlpSpan
	for _, r := range batch {
		if s, ok := span(r); ok {
			spans = append(spans, s)
		}
	}
	if len(spans) == 0 {
		return nil
	}
	target, err := url.Parse(o.URL)
	if err != nil || (target.Scheme != "http" && target.Scheme != "https") || target.Host == "" {
		return errors.New("export URL must be http(s)://host/path")
	}
	doc := map[string]any{"resourceSpans": []any{map[string]any{
		"resource":   map[string]any{"attributes": []otlpAttribute{text("service.name", "kanyue.gateway")}},
		"scopeSpans": []any{map[string]any{"scope": map[string]any{"name": "kanyue.gateway"}, "spans": spans}},
	}}}
	body, err := json.Marshal(doc)
	if err != nil {
		return err
	}
	return post(ctx, o.Client, target.String(), "application/json", bytes.NewReader(body), o.Username, o.Password, o.Token)
}

// Probe sends one marked span in a trace of its own.
func (o *OTLPTraces) Probe(ctx context.Context) error {
	ids := make([]byte, 24)
	_, _ = rand.Read(ids)
	id := hex.EncodeToString(ids)
	return o.Export(ctx, []Record{{Time: time.Now(), Kind: "probe", Message: "kanyue.gateway export probe",
		TraceID: id[:32], SpanID: id[32:]}})
}

func (o *OTLPTraces) Close() error {
	if o.Client != nil {
		o.Client.CloseIdleConnections()
	}
	return nil
}

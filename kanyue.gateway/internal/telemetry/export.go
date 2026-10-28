package telemetry

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math/rand/v2"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

// Exporter sends records to an external log platform. Export failures never
// reach the data plane; Probe writes one marked test record.
type Exporter interface {
	Export(ctx context.Context, batch []Record) error
	Probe(ctx context.Context) error
	Close() error
}

// JSONLines posts newline-delimited JSON, as VictoriaLogs /insert/jsonline,
// Vector, Fluent Bit or OpenObserve accept it. Each line carries _msg and _time.
type JSONLines struct {
	URL string
	// Username with Password is Basic auth; Token alone is a Bearer token.
	Username, Password, Token string
	// StreamFields are VictoriaLogs stream fields, e.g. stage, group and service.
	StreamFields []string
	Client       *http.Client
}

func (j *JSONLines) endpoint() (string, error) {
	target, err := url.Parse(j.URL)
	if err != nil || (target.Scheme != "http" && target.Scheme != "https") || target.Host == "" {
		return "", errors.New("export URL must be http(s)://host/path")
	}
	query := target.Query()
	if len(j.StreamFields) > 0 && query.Get("_stream_fields") == "" {
		query.Set("_stream_fields", strings.Join(j.StreamFields, ","))
	}
	target.RawQuery = query.Encode()
	return target.String(), nil
}

func (j *JSONLines) Export(ctx context.Context, batch []Record) error {
	var body bytes.Buffer
	for _, r := range batch {
		line := map[string]any{}
		raw, _ := json.Marshal(r)
		json.Unmarshal(raw, &line)
		delete(line, "id")
		delete(line, "time")
		line["_time"] = r.Time.UTC().Format(time.RFC3339Nano)
		line["_msg"] = r.Message
		if r.Kind == "request" {
			line["_msg"] = fmt.Sprintf("%s %s %d", r.Method, r.Path, r.Status)
		}
		raw, _ = json.Marshal(line)
		body.Write(raw)
		body.WriteByte('\n')
	}
	target, err := j.endpoint()
	if err != nil {
		return err
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, target, &body)
	if err != nil {
		return err
	}
	request.Header.Set("Content-Type", "application/stream+json")
	switch {
	case j.Username != "":
		request.SetBasicAuth(j.Username, j.Password)
	case j.Token != "":
		request.Header.Set("Authorization", "Bearer "+j.Token)
	}
	client := j.Client
	if client == nil {
		client = &http.Client{Timeout: 10 * time.Second}
	}
	response, err := client.Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	io.Copy(io.Discard, io.LimitReader(response.Body, 4096))
	if response.StatusCode/100 != 2 {
		return fmt.Errorf("export endpoint answered %d", response.StatusCode)
	}
	return nil
}

func (j *JSONLines) Probe(ctx context.Context) error {
	return j.Export(ctx, []Record{{Time: time.Now(), Kind: "probe", Message: "kanyue.gateway export probe"}})
}

func (j *JSONLines) Close() error {
	if j.Client != nil {
		j.Client.CloseIdleConnections()
	}
	return nil
}

// ExportConfig is one configured export target.
type ExportConfig struct {
	Name     string
	Exporter Exporter
	// Sample is the share of successful requests exported; errors, events and slow requests always go.
	Sample     float64
	OnlyErrors bool
}

// Export queues records for one exporter and sends them in batches, backing
// off while the target fails; a full queue drops and counts.
type Export struct {
	ExportConfig
	queue        chan Record
	dropped      atomic.Int64
	failingSince atomic.Int64
	lastError    atomic.Pointer[string]
	slow         time.Duration
	stop         context.CancelFunc
	done         sync.WaitGroup
}

// ExportStatus is what the console and the alert rules see of an export.
type ExportStatus struct {
	Name         string    `json:"name"`
	Queued       int       `json:"queued"`
	Dropped      int64     `json:"dropped"`
	FailingSince time.Time `json:"failingSince,omitzero"`
	LastError    string    `json:"lastError,omitempty"`
}

const (
	exportQueue = 5000
	exportBatch = 500
	maxBackoff  = time.Minute
	// A batch that keeps failing is dropped after this many attempts, so newer records get their turn.
	exportAttempts = 5
)

func (x *Export) offer(r Record) {
	important := r.Kind != "request" || r.Status >= 500 || r.Status == 0 || r.Error != "" ||
		time.Duration(r.DurationMs*1e6) >= x.slow
	if !important && (x.OnlyErrors || rand.Float64() >= x.Sample) {
		return
	}
	select {
	case x.queue <- r:
	default:
		x.dropped.Add(1)
	}
}

func (x *Export) run(ctx context.Context) {
	defer x.done.Done()
	tick := time.NewTicker(time.Second)
	defer tick.Stop()
	backoff := time.Second
	var batch []Record
	attempts := 0
	for {
		for len(batch) < exportBatch {
			select {
			case r := <-x.queue:
				batch = append(batch, r)
				continue
			default:
			}
			break
		}
		if len(batch) > 0 {
			send, cancel := context.WithTimeout(ctx, 15*time.Second)
			err := x.Exporter.Export(send, batch)
			cancel()
			switch {
			case err == nil:
				batch, attempts, backoff = nil, 0, time.Second
				x.failingSince.Store(0)
			case ctx.Err() != nil:
				return
			default:
				message := err.Error()
				x.lastError.Store(&message)
				x.failingSince.CompareAndSwap(0, time.Now().UnixMilli())
				if attempts++; attempts >= exportAttempts {
					x.dropped.Add(int64(len(batch)))
					batch, attempts = nil, 0
				}
				select {
				case <-ctx.Done():
					return
				case <-time.After(backoff):
				}
				backoff = min(2*backoff, maxBackoff)
				continue
			}
		}
		select {
		case <-ctx.Done():
			return
		case <-tick.C:
		}
	}
}

func (x *Export) Status() ExportStatus {
	status := ExportStatus{Name: x.Name, Queued: len(x.queue), Dropped: x.dropped.Load()}
	if since := x.failingSince.Load(); since > 0 {
		status.FailingSince = time.UnixMilli(since)
		if message := x.lastError.Load(); message != nil {
			status.LastError = *message
		}
	}
	return status
}

// SetExports replaces the running exports with configs; queued records of the old ones are dropped.
func (t *Telemetry) SetExports(configs []ExportConfig) {
	var next []*Export
	for _, config := range configs {
		ctx, cancel := context.WithCancel(context.Background())
		x := &Export{ExportConfig: config, queue: make(chan Record, exportQueue), slow: t.opts.Slow, stop: cancel}
		x.done.Add(1)
		go x.run(ctx)
		next = append(next, x)
	}
	previous := t.exports.Swap(&next)
	for _, x := range *previous {
		x.stop()
		x.done.Wait()
		x.Exporter.Close()
	}
}

func (t *Telemetry) Exports() []ExportStatus {
	var out []ExportStatus
	for _, x := range *t.exports.Load() {
		out = append(out, x.Status())
	}
	return out
}

// ExportDropped is the total dropped by the running exports.
func (t *Telemetry) ExportDropped() int64 {
	var total int64
	for _, x := range *t.exports.Load() {
		total += x.dropped.Load()
	}
	return total
}

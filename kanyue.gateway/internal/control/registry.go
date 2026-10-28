package control

import (
	"context"
	"crypto/subtle"
	"errors"
	"fmt"
	"net"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/types"

	"kanyue.gateway/internal/proxy"
	"kanyue.gateway/internal/schema"
	"kanyue.gateway/internal/snapshot"
	"kanyue.gateway/internal/telemetry"
)

const (
	// HeartbeatInterval is what services are told to use; three missed beats take an instance offline.
	HeartbeatInterval = 10 * time.Second
	heartbeatExpiry   = 3 * HeartbeatInterval
	dnsInterval       = 30 * time.Second
	defaultManifest   = "/internal/gateway/manifest"
)

var (
	serviceName = regexp.MustCompile(`^[a-z0-9][a-z0-9._-]{0,62}$`)
	stageName   = regexp.MustCompile(`^[A-Z][A-Z0-9_]{0,19}$`)
)

// Beat is one service instance announcing itself.
type Beat struct {
	Service      string `json:"service"`
	Address      string `json:"address"`
	Stage        string `json:"stage"`
	Version      string `json:"version"`
	ManifestHash string `json:"manifestHash"`
	// What happened since the last beat: outbound calls, gauges such as the
	// outbox dead-letter backlog, and the last backup result.
	Outbound []telemetry.Outbound `json:"outbound,omitempty"`
	Gauges   map[string]float64   `json:"gauges,omitempty"`
	Backup   *Backup              `json:"backup,omitempty"`
}

func (b *Beat) normalize() error {
	b.Stage = strings.ToUpper(strings.TrimSpace(b.Stage))
	if b.Stage == "" {
		b.Stage = proxy.DefaultStage
	}
	host, port, err := net.SplitHostPort(b.Address)
	switch {
	case !serviceName.MatchString(b.Service):
		return errors.New("service must be a lower-case name")
	case err != nil || host == "" || port == "":
		return errors.New("address must be host:port")
	case !stageName.MatchString(b.Stage):
		return errors.New("stage must be an upper-case name")
	case len(b.Version) > 100 || len(b.ManifestHash) > 64 || len(b.Outbound) > 100 || len(b.Gauges) > 50:
		return errors.New("version or manifest hash too long")
	}
	return nil
}

func (c *Control) authorized(e *core.RequestEvent) bool {
	if c.cfg.RegistrationToken == "" {
		return false
	}
	given := strings.TrimPrefix(e.Request.Header.Get("Authorization"), "Bearer ")
	return subtle.ConstantTimeCompare([]byte(given), []byte(c.cfg.RegistrationToken)) == 1
}

func (c *Control) heartbeatRoute(e *core.RequestEvent) error {
	if !c.authorized(e) {
		return e.JSON(http.StatusUnauthorized, map[string]any{"error": "unauthorized"})
	}
	var beat Beat
	if err := e.BindBody(&beat); err != nil {
		return e.BadRequestError("Invalid body.", err)
	}
	if err := c.Heartbeat(beat); err != nil {
		if errors.Is(err, errBadBeat) {
			return e.BadRequestError(err.Error(), nil)
		}
		if errors.Is(err, errNotRegistry) {
			return e.JSON(http.StatusConflict, map[string]any{"error": err.Error()})
		}
		return err
	}
	return e.JSON(http.StatusOK, map[string]any{"heartbeatSeconds": int(HeartbeatInterval.Seconds()),
		"expireSeconds": int(heartbeatExpiry.Seconds())})
}

func (c *Control) deregisterRoute(e *core.RequestEvent) error {
	if !c.authorized(e) {
		return e.JSON(http.StatusUnauthorized, map[string]any{"error": "unauthorized"})
	}
	var beat Beat
	if err := e.BindBody(&beat); err != nil {
		return e.BadRequestError("Invalid body.", err)
	}
	if err := c.Deregister(beat); err != nil {
		if errors.Is(err, errBadBeat) {
			return e.BadRequestError(err.Error(), nil)
		}
		return err
	}
	return e.NoContent(http.StatusNoContent)
}

var (
	errNotRegistry = errors.New("service is not discovered by registration")
	errBadBeat     = errors.New("invalid heartbeat")
)

// Heartbeat registers or refreshes an instance; an unknown service is created,
// because services are discovered, never typed in.
func (c *Control) Heartbeat(beat Beat) error {
	if err := beat.normalize(); err != nil {
		return fmt.Errorf("%w: %w", errBadBeat, err)
	}
	service, err := c.app.FindFirstRecordByData(schema.Services, "name", beat.Service)
	if err != nil {
		collection, findErr := c.app.FindCollectionByNameOrId(schema.Services)
		if findErr != nil {
			return findErr
		}
		service = core.NewRecord(collection)
		service.Load(map[string]any{"name": beat.Service, "discovery": "registry", "manifestPath": defaultManifest})
		if err := c.app.Save(service); err != nil {
			return err
		}
		c.audit("", "discover", schema.Services, service.Id, map[string]any{"name": beat.Service})
	}
	if service.GetString("discovery") != "registry" {
		return errNotRegistry
	}
	instance, err := c.app.FindFirstRecordByFilter(schema.Instances, "service = {:s} && address = {:a}",
		dbx.Params{"s": service.Id, "a": beat.Address})
	if err != nil {
		collection, findErr := c.app.FindCollectionByNameOrId(schema.Instances)
		if findErr != nil {
			return findErr
		}
		instance = core.NewRecord(collection)
		instance.Load(map[string]any{"service": service.Id, "address": beat.Address, "source": "registry"})
	}
	if instance.GetString("status") != "drained" {
		instance.Set("status", "online")
	}
	instance.Load(map[string]any{"stage": beat.Stage, "version": beat.Version, "manifestHash": beat.ManifestHash,
		"lastSeen": types.NowDateTime()})
	if err := c.app.Save(instance); err != nil {
		return err
	}
	if beat.ManifestHash != "" && beat.ManifestHash != service.GetString("manifestHash") {
		c.syncInBackground(service.Id, beat.Address)
	}
	c.report(beat, time.Now())
	return nil
}

// Deregister takes an instance offline at once, for graceful restarts.
func (c *Control) Deregister(beat Beat) error {
	if err := beat.normalize(); err != nil {
		return fmt.Errorf("%w: %w", errBadBeat, err)
	}
	service, err := c.app.FindFirstRecordByData(schema.Services, "name", beat.Service)
	if err != nil {
		return nil
	}
	instance, err := c.app.FindFirstRecordByFilter(schema.Instances, "service = {:s} && address = {:a} && source = 'registry'",
		dbx.Params{"s": service.Id, "a": beat.Address})
	if err != nil || instance.GetString("status") != "online" {
		return nil
	}
	instance.Set("status", "offline")
	return c.app.Save(instance)
}

// Expire takes registered instances offline once their heartbeats stop.
func (c *Control) Expire(now time.Time) error {
	cutoff, err := types.ParseDateTime(now.Add(-heartbeatExpiry))
	if err != nil {
		return err
	}
	stale, err := c.app.FindAllRecords(schema.Instances, dbx.HashExp{"source": "registry", "status": "online"},
		dbx.NewExp("lastSeen < {:cutoff}", dbx.Params{"cutoff": cutoff.String()}))
	if err != nil {
		return err
	}
	for _, instance := range stale {
		instance.Set("status", "offline")
		if err := c.app.Save(instance); err != nil {
			return err
		}
		c.app.Logger().Warn("Instance expired", "service", instance.GetString("service"), "address", instance.GetString("address"))
	}
	return nil
}

// ResolveDNS refreshes the instances of DNS-discovered services.
func (c *Control) ResolveDNS(ctx context.Context, lookup func(context.Context, string) ([]string, error)) error {
	services, err := c.app.FindAllRecords(schema.Services, dbx.HashExp{"discovery": "dns"})
	if err != nil {
		return err
	}
	collection, err := c.app.FindCollectionByNameOrId(schema.Instances)
	if err != nil {
		return err
	}
	for _, service := range services {
		name, port := service.GetString("dnsName"), service.GetInt("dnsPort")
		if name == "" || port == 0 {
			continue
		}
		addrs, err := lookup(ctx, name)
		if err != nil {
			c.app.Logger().Warn("DNS discovery failed", "service", service.GetString("name"), "error", err.Error())
			continue // keep the last known instances rather than dropping a service on a resolver hiccup
		}
		stage := strings.ToUpper(service.GetString("dnsStage"))
		if stage == "" {
			stage = proxy.DefaultStage
		}
		seen := map[string]bool{}
		for _, addr := range addrs {
			address := net.JoinHostPort(addr, strconv.Itoa(port))
			seen[address] = true
			instance, err := c.app.FindFirstRecordByFilter(schema.Instances, "service = {:s} && address = {:a}",
				dbx.Params{"s": service.Id, "a": address})
			if err != nil {
				instance = core.NewRecord(collection)
				instance.Load(map[string]any{"service": service.Id, "address": address, "source": "dns", "status": "online"})
			} else if instance.GetString("status") == "offline" {
				instance.Set("status", "online")
			}
			instance.Load(map[string]any{"stage": stage, "lastSeen": types.NowDateTime()})
			if err := c.app.Save(instance); err != nil {
				return err
			}
		}
		known, err := c.app.FindAllRecords(schema.Instances, dbx.HashExp{"service": service.Id, "source": "dns", "status": "online"})
		if err != nil {
			return err
		}
		for _, instance := range known {
			if !seen[instance.GetString("address")] {
				instance.Set("status", "offline")
				if err := c.app.Save(instance); err != nil {
					return err
				}
			}
		}
	}
	return nil
}

func (c *Control) scheduleRebuild() {
	select {
	case c.rebuild <- struct{}{}:
	default:
	}
}

// routableInstances are online, and confirmed when typed by hand.
func (c *Control) routableInstances() ([]snapshot.Instance, error) {
	records, err := c.app.FindAllRecords(schema.Instances, dbx.HashExp{"status": "online"})
	if err != nil {
		return nil, err
	}
	instances := make([]snapshot.Instance, 0, len(records))
	for _, record := range records {
		if record.GetString("source") == "static" && !record.GetBool("confirmed") {
			continue
		}
		instances = append(instances, snapshot.Instance{Service: record.GetString("service"), Stage: record.GetString("stage"),
			Address: record.GetString("address"), Weight: record.GetInt("weight")})
	}
	return instances, nil
}

// rebuildEndpoints swaps in the routable instances.
func (c *Control) rebuildEndpoints() error {
	instances, err := c.routableInstances()
	if err != nil {
		return err
	}
	endpoints, err := snapshot.NewEndpoints(instances, c.handler.Endpoints())
	if err != nil {
		return err
	}
	c.handler.SetEndpoints(endpoints)
	c.routable = routableKey(instances)
	return nil
}

// loop runs expiry, DNS refresh, coalesced endpoint rebuilds and the sync with
// other processes until ctx ends.
func (c *Control) loop(ctx context.Context) {
	expiry := time.NewTicker(HeartbeatInterval)
	dns := time.NewTicker(dnsInterval)
	sync := time.NewTicker(syncInterval)
	defer expiry.Stop()
	defer dns.Stop()
	defer sync.Stop()
	report := func(what string, err error) {
		if err != nil {
			c.app.Logger().Error(what+" failed", "error", err.Error())
		}
	}
	report("DNS discovery", c.ResolveDNS(ctx, net.DefaultResolver.LookupHost))
	for {
		select {
		case <-ctx.Done():
			return
		case now := <-expiry.C:
			report("Instance expiry", c.Expire(now))
		case <-dns.C:
			report("DNS discovery", c.ResolveDNS(ctx, net.DefaultResolver.LookupHost))
		case <-c.rebuild:
			report("Endpoint rebuild", c.rebuildEndpoints())
		case <-sync.C:
			report("Sync with other processes", c.sync())
		}
	}
}

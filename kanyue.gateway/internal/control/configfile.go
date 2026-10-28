package control

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"slices"
	"strings"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"

	"kanyue.gateway/internal/schema"
)

// ConfigFile is the drafts of API groups with their domains and APIs, policy
// sets and grants, referenced by name so it reads well in review. It holds no
// secret values: plugins name their secrets, and applications (which carry an
// AppSecret) stay in the console. Names are identities: renaming is a delete
// and a create.
type ConfigFile struct {
	Version    int             `json:"version"`
	PolicySets []FilePolicySet `json:"policySets"`
	Groups     []FileGroup     `json:"groups"`
	Grants     []FileGrant     `json:"grants"`
}

type FilePolicySet struct {
	Name  string `json:"name"`
	Items any    `json:"items"`
	Note  string `json:"note,omitempty"`
}

type FileGroup struct {
	Name             string       `json:"name"`
	DefaultPolicySet string       `json:"defaultPolicySet,omitempty"`
	Note             string       `json:"note,omitempty"`
	Domains          []FileDomain `json:"domains"`
	APIs             []FileAPI    `json:"apis"`
}

type FileDomain struct {
	Host       string `json:"host"`
	FixedStage string `json:"fixedStage,omitempty"`
}

type FileAPI struct {
	Name            string `json:"name"`
	Service         string `json:"service"`
	Operation       string `json:"operation"` // METHOD /path as the service declares it
	Visibility      string `json:"visibility"`
	Auth            string `json:"auth"`
	PolicySet       string `json:"policySet,omitempty"`
	Overrides       any    `json:"overrides,omitempty"`
	Priority        int    `json:"priority,omitempty"`
	HeaderTimeoutMs int    `json:"headerTimeoutMs,omitempty"`
	TimeoutMs       int    `json:"timeoutMs,omitempty"`
	IdleTimeoutMs   int    `json:"idleTimeoutMs,omitempty"`
	Note            string `json:"note,omitempty"`
}

type FileGrant struct {
	Consumer string   `json:"consumer"`
	Group    string   `json:"group"`
	API      string   `json:"api,omitempty"` // an API of Group; empty grants the whole group
	Stages   []string `json:"stages,omitempty"`
	Note     string   `json:"note,omitempty"`
}

const configFileVersion = 1

func jsonValue(record *core.Record, field string) any {
	var value any
	record.UnmarshalJSONField(field, &value)
	return value
}

func byName(records []*core.Record) map[string]string {
	out := map[string]string{}
	for _, record := range records {
		out[record.Id] = record.GetString("name")
	}
	return out
}

// ExportConfig reads the drafts into a file, sorted by name.
func (c *Control) ExportConfig() (ConfigFile, error) {
	file := ConfigFile{Version: configFileVersion, PolicySets: []FilePolicySet{}, Groups: []FileGroup{}, Grants: []FileGrant{}}
	var errs []error
	read := func(collection string) []*core.Record {
		records, err := c.app.FindAllRecords(collection)
		errs = append(errs, err)
		return records
	}
	sets, groups, domains := read(schema.PolicySets), read(schema.APIGroups), read(schema.GroupDomains)
	apis, ops, services := read(schema.APIs), read(schema.Operations), read(schema.Services)
	grants, consumers := read(schema.Grants), read(schema.Consumers)
	if err := errors.Join(errs...); err != nil {
		return file, err
	}
	setName, groupName, serviceName, consumerName := byName(sets), byName(groups), byName(services), byName(consumers)
	opByID := map[string]*core.Record{}
	for _, op := range ops {
		opByID[op.Id] = op
	}
	apiByID := map[string]*core.Record{}
	for _, api := range apis {
		apiByID[api.Id] = api
	}

	for _, set := range sets {
		items := jsonValue(set, "items")
		if items == nil {
			items = []any{}
		}
		file.PolicySets = append(file.PolicySets, FilePolicySet{Name: set.GetString("name"), Items: items, Note: set.GetString("note")})
	}
	slices.SortFunc(file.PolicySets, func(a, b FilePolicySet) int { return strings.Compare(a.Name, b.Name) })
	for _, group := range groups {
		out := FileGroup{Name: group.GetString("name"), DefaultPolicySet: setName[group.GetString("defaultPolicySet")],
			Note: group.GetString("note"), Domains: []FileDomain{}, APIs: []FileAPI{}}
		for _, domain := range domains {
			if domain.GetString("group") == group.Id {
				out.Domains = append(out.Domains, FileDomain{Host: domain.GetString("host"), FixedStage: domain.GetString("fixedStage")})
			}
		}
		slices.SortFunc(out.Domains, func(a, b FileDomain) int { return strings.Compare(a.Host, b.Host) })
		for _, api := range apis {
			if api.GetString("group") != group.Id {
				continue
			}
			op := opByID[api.GetString("operation")]
			if op == nil {
				return file, fmt.Errorf("API %q has no operation", api.GetString("name"))
			}
			out.APIs = append(out.APIs, FileAPI{Name: api.GetString("name"), Service: serviceName[op.GetString("service")],
				Operation: patternOf(op), Visibility: api.GetString("visibility"), Auth: api.GetString("auth"),
				PolicySet: setName[api.GetString("policySet")], Overrides: jsonValue(api, "overrides"), Priority: api.GetInt("priority"),
				HeaderTimeoutMs: api.GetInt("headerTimeoutMs"), TimeoutMs: api.GetInt("timeoutMs"), IdleTimeoutMs: api.GetInt("idleTimeoutMs"),
				Note: api.GetString("note")})
		}
		slices.SortFunc(out.APIs, func(a, b FileAPI) int { return strings.Compare(a.Name, b.Name) })
		file.Groups = append(file.Groups, out)
	}
	slices.SortFunc(file.Groups, func(a, b FileGroup) int { return strings.Compare(a.Name, b.Name) })
	for _, grant := range grants {
		out := FileGrant{Consumer: consumerName[grant.GetString("consumer")], Group: groupName[grant.GetString("group")],
			Stages: grant.GetStringSlice("stages"), Note: grant.GetString("note")}
		if api := apiByID[grant.GetString("api")]; api != nil {
			out.Group, out.API = groupName[api.GetString("group")], api.GetString("name")
		}
		file.Grants = append(file.Grants, out)
	}
	slices.SortFunc(file.Grants, func(a, b FileGrant) int {
		return strings.Compare(a.Consumer+"\x00"+a.Group+"\x00"+a.API, b.Consumer+"\x00"+b.Group+"\x00"+b.API)
	})
	return file, nil
}

// FileChange is one draft an apply creates, updates or deletes.
type FileChange struct {
	Action   string            `json:"action"`
	Resource string            `json:"resource"`
	Name     string            `json:"name"`
	Diff     map[string]Change `json:"diff,omitempty"`
}

var errDryRun = errors.New("dry run")

// ApplyConfig makes the drafts match file in one transaction and lists what
// changed; a dry run lists it and keeps nothing. Drafts are checked as when
// edited in the console. No environment changes until a release.
func (c *Control) ApplyConfig(actor string, file ConfigFile, dryRun bool) ([]FileChange, error) {
	if file.Version != configFileVersion {
		return nil, fmt.Errorf("unsupported config file version %d; export again", file.Version)
	}
	var s *syncer
	err := c.app.RunInTransaction(func(tx core.App) error {
		s = &syncer{tx: tx, ops: map[string][]*core.Record{}}
		if err := s.run(file); err != nil {
			return err
		}
		if dryRun {
			return errDryRun
		}
		return nil
	})
	if err != nil && !errors.Is(err, errDryRun) {
		return nil, err
	}
	if !dryRun && len(s.out) > 0 {
		c.audit(actor, "apply-config", "drafts", "", map[string]any{"changes": s.out})
	}
	return s.out, nil
}

type syncer struct {
	tx  core.App
	out []FileChange
	ops map[string][]*core.Record // service name → operations
}

// normalized is value as JSON would read it back, so stored and loaded forms compare equal.
func normalized(value any) any {
	raw, _ := json.Marshal(value)
	var out any
	json.Unmarshal(raw, &out)
	return out
}

// put saves record with fields when that changes anything, and reports it.
func (s *syncer) put(resource, name string, record *core.Record, fields map[string]any) error {
	isNew := record.IsNew()
	before := map[string]any{}
	for key := range fields {
		before[key] = normalized(record.Get(key))
	}
	record.Load(fields)
	after := map[string]any{}
	for key := range fields {
		after[key] = normalized(record.Get(key))
	}
	diff := fieldDiff(before, after)
	if !isNew && len(diff) == 0 {
		return nil
	}
	if err := s.tx.Save(record); err != nil {
		return fmt.Errorf("%s %s: %w", resource, name, err)
	}
	change := FileChange{Action: "update", Resource: resource, Name: name, Diff: diff}
	if isNew {
		change = FileChange{Action: "create", Resource: resource, Name: name}
	}
	s.out = append(s.out, change)
	return nil
}

// find returns the record matching every column, or a new one.
func (s *syncer) find(collection string, match dbx.HashExp) (*core.Record, error) {
	records, err := s.tx.FindAllRecords(collection, match)
	if err != nil || len(records) > 0 {
		return firstRecord(records), err
	}
	c, err := s.tx.FindCachedCollectionByNameOrId(collection)
	if err != nil {
		return nil, err
	}
	return core.NewRecord(c), nil
}

func firstRecord(records []*core.Record) *core.Record {
	if len(records) == 0 {
		return nil
	}
	return records[0]
}

func (s *syncer) operation(service, pattern string) (*core.Record, error) {
	ops, ok := s.ops[service]
	if !ok {
		record, err := s.tx.FindFirstRecordByData(schema.Services, "name", service)
		if err != nil {
			return nil, fmt.Errorf("service %q has not registered with the gateway", service)
		}
		if ops, err = s.tx.FindAllRecords(schema.Operations, dbx.HashExp{"service": record.Id}); err != nil {
			return nil, err
		}
		s.ops[service] = ops
	}
	var found *core.Record
	for _, op := range ops {
		if patternOf(op) == pattern && (found == nil || found.GetString("status") == "removed") {
			found = op
		}
	}
	if found == nil {
		return nil, fmt.Errorf("service %q has no operation %q", service, pattern)
	}
	return found, nil
}

// prune deletes the records of collection that keep refuses.
func (s *syncer) prune(collection, resource string, keep func(*core.Record) bool, label func(*core.Record) string) error {
	records, err := s.tx.FindAllRecords(collection)
	if err != nil {
		return err
	}
	for _, record := range records {
		if keep(record) {
			continue
		}
		name := label(record)
		if err := s.tx.Delete(record); err != nil {
			return fmt.Errorf("%s %s: %w", resource, name, err)
		}
		s.out = append(s.out, FileChange{Action: "delete", Resource: resource, Name: name})
	}
	return nil
}

func (s *syncer) run(file ConfigFile) error {
	setIDs := map[string]string{}
	for _, set := range file.PolicySets {
		record, err := s.find(schema.PolicySets, dbx.HashExp{"name": set.Name})
		if err != nil {
			return err
		}
		items := set.Items
		if items == nil {
			items = []any{}
		}
		if err := s.put("policySet", set.Name, record, map[string]any{"name": set.Name, "items": items, "note": set.Note}); err != nil {
			return err
		}
		setIDs[set.Name] = record.Id
	}
	setRef := func(name string) (string, error) {
		if name == "" {
			return "", nil
		}
		if id, ok := setIDs[name]; ok {
			return id, nil
		}
		if name == schema.Baseline {
			record, err := s.tx.FindFirstRecordByData(schema.PolicySets, "name", name)
			if err != nil {
				return "", err
			}
			return record.Id, nil
		}
		return "", fmt.Errorf("policy set %q is not in the file", name)
	}

	groupIDs, hosts, apiIDs := map[string]string{}, map[string]bool{}, map[[2]string]string{}
	for _, group := range file.Groups {
		record, err := s.find(schema.APIGroups, dbx.HashExp{"name": group.Name})
		if err != nil {
			return err
		}
		set, err := setRef(group.DefaultPolicySet)
		if err != nil {
			return fmt.Errorf("group %s: %w", group.Name, err)
		}
		if err := s.put("group", group.Name, record, map[string]any{"name": group.Name, "defaultPolicySet": set, "note": group.Note}); err != nil {
			return err
		}
		groupIDs[group.Name] = record.Id
		for _, domain := range group.Domains {
			host := strings.ToLower(strings.TrimSpace(domain.Host))
			if hosts[host] {
				return fmt.Errorf("domain %s is listed twice", host)
			}
			hosts[host] = true
			existing, err := s.find(schema.GroupDomains, dbx.HashExp{"host": host})
			if err != nil {
				return err
			}
			if err := s.put("domain", host, existing, map[string]any{"group": record.Id, "host": host, "fixedStage": domain.FixedStage}); err != nil {
				return err
			}
		}
		for _, api := range group.APIs {
			label := group.Name + "/" + api.Name
			op, err := s.operation(api.Service, api.Operation)
			if err != nil {
				return fmt.Errorf("api %s: %w", label, err)
			}
			set, err := setRef(api.PolicySet)
			if err != nil {
				return fmt.Errorf("api %s: %w", label, err)
			}
			existing, err := s.find(schema.APIs, dbx.HashExp{"group": record.Id, "name": api.Name})
			if err != nil {
				return err
			}
			if err := s.put("api", label, existing, map[string]any{"group": record.Id, "name": api.Name, "operation": op.Id,
				"visibility": api.Visibility, "auth": api.Auth, "policySet": set, "overrides": api.Overrides, "priority": api.Priority,
				"headerTimeoutMs": api.HeaderTimeoutMs, "timeoutMs": api.TimeoutMs, "idleTimeoutMs": api.IdleTimeoutMs, "note": api.Note}); err != nil {
				return err
			}
			apiIDs[[2]string{group.Name, api.Name}] = existing.Id
		}
	}

	grantIDs := map[string]bool{}
	for _, grant := range file.Grants {
		label := grant.Consumer + " → " + grant.Group
		consumer, err := s.tx.FindFirstRecordByData(schema.Consumers, "name", grant.Consumer)
		if err != nil {
			return fmt.Errorf("grant %s: application %q does not exist; applications hold secrets and are created in the console", label, grant.Consumer)
		}
		fields := map[string]any{"consumer": consumer.Id, "group": "", "api": "", "stages": grant.Stages, "note": grant.Note}
		if grant.API != "" {
			label += "/" + grant.API
			id, ok := apiIDs[[2]string{grant.Group, grant.API}]
			if !ok {
				return fmt.Errorf("grant %s: the API is not in the file", label)
			}
			fields["api"] = id
		} else {
			id, ok := groupIDs[grant.Group]
			if !ok {
				return fmt.Errorf("grant %s: the group is not in the file", label)
			}
			fields["group"] = id
		}
		existing, err := s.find(schema.Grants, dbx.HashExp{"consumer": consumer.Id, "group": fields["group"], "api": fields["api"]})
		if err != nil {
			return err
		}
		if grantIDs[existing.Id] && existing.Id != "" {
			return fmt.Errorf("grant %s is listed twice", label)
		}
		if err := s.put("grant", label, existing, fields); err != nil {
			return err
		}
		grantIDs[existing.Id] = true
	}

	// Deletions, dependants first; the platform baseline always stays.
	nameOf := func(collection, id string) string {
		if record, err := s.tx.FindRecordById(collection, id); err == nil {
			return record.GetString("name")
		}
		return id
	}
	apiLabel := func(api *core.Record) string {
		return nameOf(schema.APIGroups, api.GetString("group")) + "/" + api.GetString("name")
	}
	keptAPIs := map[string]bool{}
	for _, id := range apiIDs {
		keptAPIs[id] = true
	}
	return errors.Join(
		s.prune(schema.Grants, "grant", func(r *core.Record) bool { return grantIDs[r.Id] }, func(r *core.Record) string {
			target := nameOf(schema.APIGroups, r.GetString("group"))
			if api, err := s.tx.FindRecordById(schema.APIs, r.GetString("api")); err == nil {
				target = apiLabel(api)
			}
			return nameOf(schema.Consumers, r.GetString("consumer")) + " → " + target
		}),
		s.prune(schema.APIs, "api", func(r *core.Record) bool { return keptAPIs[r.Id] }, apiLabel),
		s.prune(schema.GroupDomains, "domain", func(r *core.Record) bool { return hosts[r.GetString("host")] },
			func(r *core.Record) string { return r.GetString("host") }),
		s.prune(schema.APIGroups, "group", func(r *core.Record) bool { return groupIDs[r.GetString("name")] != "" },
			func(r *core.Record) string { return r.GetString("name") }),
		s.prune(schema.PolicySets, "policySet", func(r *core.Record) bool {
			return setIDs[r.GetString("name")] != "" || r.GetString("name") == schema.Baseline
		}, func(r *core.Record) string { return r.GetString("name") }),
	)
}

func (c *Control) exportConfigRoute(e *core.RequestEvent) error {
	file, err := c.ExportConfig()
	if err != nil {
		return err
	}
	return e.JSON(http.StatusOK, file)
}

func (c *Control) applyConfigRoute(e *core.RequestEvent) error {
	var file ConfigFile
	if err := e.BindBody(&file); err != nil {
		return e.BadRequestError("Invalid config file.", err)
	}
	dryRun := e.Request.URL.Query().Get("dryRun") == "1"
	changes, err := c.ApplyConfig(principalOf(e).Actor, file, dryRun)
	if err != nil {
		return e.JSON(http.StatusUnprocessableEntity, map[string]any{"error": err.Error()})
	}
	return e.JSON(http.StatusOK, map[string]any{"dryRun": dryRun, "changes": changes})
}

// Package policy resolves an API's effective policies from fixed layers: the
// platform baseline, the group's default policy set, the API's policy set, the
// API's overrides, and per-application settings. Each layer has at most one
// source and policy sets never include each other, so "who wins" is always the
// lowest layer that configures a policy, unless a higher layer locked it.
// Resolution is pure: the control plane feeds it records, the console shows it.
package policy

import (
	"encoding/json"
	"errors"
	"fmt"
	"slices"
	"sort"

	"kanyue.gateway/internal/plugin"
)

// Stages are the environments APIs are released to; RELEASE serves requests that name none.
var Stages = []string{"TEST", "PRE", "RELEASE"}

// DefaultStage serves requests without X-Ca-Stage on domains without a fixed environment.
const DefaultStage = "RELEASE"

func ValidStage(stage string) bool { return slices.Contains(Stages, stage) }

// Layer kinds, highest first.
const (
	Baseline    = "baseline"
	GroupSet    = "group"
	APISet      = "api"
	Overrides   = "override"
	Application = "consumer"
	// Auth marks authentication brought by the API's auth field without a configuring item.
	Auth = "auth"
)

// Item is one policy in a policy set, an API's overrides or an application's settings.
type Item struct {
	Plugin   string          `json:"plugin"`
	Config   json.RawMessage `json:"config,omitempty"`
	Priority int             `json:"priority,omitempty"`
	// Stages limits the item to some environments; empty is every environment.
	Stages []string `json:"stages,omitempty"`
	// Locked items cannot be changed or switched off below; rate limits may still be added.
	Locked bool `json:"locked,omitempty"`
	// Disabled switches an inherited, unlocked policy off.
	Disabled bool `json:"disabled,omitempty"`
}

func (i Item) applies(stage string) bool {
	return len(i.Stages) == 0 || slices.Contains(i.Stages, stage)
}

// Layer is one source of items.
type Layer struct {
	Kind string `json:"kind"`
	// Source names it: the policy set, API or application.
	Source string `json:"source"`
	Items  []Item `json:"items"`
}

// Effective is one policy that applies, with where it comes from.
type Effective struct {
	plugin.Binding
	Layer  string `json:"layer"`
	Source string `json:"source"`
	Locked bool   `json:"locked,omitempty"`
}

// Stacks reports whether every layer's item of the plugin applies, each with its
// own counter, instead of the lowest one replacing the others.
func Stacks(name string) bool { return name == "rate-limit" }

// authPlugins apply only as an API's auth field asks; items of them only configure them.
var authPlugins = map[string]string{"signature": "aliyun-signature", "jwt": "jwt-auth"}

// AuthModes are the values of an API's auth field. passthrough leaves
// authentication to the upstream; none means the API needs none.
var AuthModes = []string{"passthrough", "none", "signature", "jwt"}

func isAuthPlugin(name string) bool {
	for _, p := range authPlugins {
		if p == name {
			return true
		}
	}
	return false
}

// CheckLayer validates a layer's items on their own: known plugins, valid
// configurations and stages, no duplicated override-kind policy per environment,
// and switches that make sense at that layer. It does not see other layers.
func CheckLayer(layer Layer) error {
	var errs []error
	for i, item := range layer.Items {
		where := fmt.Sprintf("item %d (%s)", i+1, item.Plugin)
		for _, stage := range item.Stages {
			if !ValidStage(stage) {
				errs = append(errs, fmt.Errorf("%s: unknown environment %q", where, stage))
			}
		}
		switch {
		case item.Disabled && (layer.Kind == Baseline || layer.Kind == Application):
			errs = append(errs, fmt.Errorf("%s: the %s cannot switch a policy off", where, layerName(layer.Kind)))
		case item.Disabled && item.Locked:
			errs = append(errs, fmt.Errorf("%s: a switched-off item cannot be locked", where))
		case layer.Kind == Application && isAuthPlugin(item.Plugin):
			errs = append(errs, fmt.Errorf("%s: authentication is not configured per application", where))
		}
		if item.Disabled {
			if _, ok := plugin.Lookup(item.Plugin); !ok {
				errs = append(errs, fmt.Errorf("%s: unknown plugin", where))
			}
			continue
		}
		if err := plugin.Check(item.Plugin, item.Config); err != nil {
			errs = append(errs, fmt.Errorf("%s: %w", where, err))
		}
	}
	for _, stage := range Stages {
		seen := map[string]bool{}
		for _, item := range layer.Items {
			if !item.applies(stage) || Stacks(item.Plugin) {
				continue
			}
			if seen[item.Plugin] {
				errs = append(errs, fmt.Errorf("%s appears twice for %s; give the items different environments", item.Plugin, stage))
			}
			seen[item.Plugin] = true
		}
	}
	return errors.Join(errs...)
}

func layerName(kind string) string {
	switch kind {
	case Baseline:
		return "platform baseline"
	case GroupSet:
		return "group's policy set"
	case APISet:
		return "API's policy set"
	case Overrides:
		return "API overrides"
	case Application:
		return "application settings"
	}
	return kind
}

func describe(e Effective) string {
	if e.Source == "" {
		return layerName(e.Layer)
	}
	return fmt.Sprintf("%s %q", layerName(e.Layer), e.Source)
}

// Resolve merges the layers, highest first, for one environment.
func Resolve(stage string, layers ...Layer) ([]Effective, error) {
	var list []Effective
	var errs []error
	for _, layer := range layers {
		for i, item := range layer.Items {
			if !item.applies(stage) {
				continue
			}
			if _, ok := plugin.Lookup(item.Plugin); !ok {
				errs = append(errs, fmt.Errorf("%s: unknown plugin %q", layerName(layer.Kind), item.Plugin))
				continue
			}
			if Stacks(item.Plugin) {
				if item.Disabled {
					kept := list[:0:0]
					for _, e := range list {
						if e.Plugin == item.Plugin && e.Locked {
							errs = append(errs, fmt.Errorf("%s cannot switch %s off: it is locked by the %s", layerName(layer.Kind), item.Plugin, describe(e)))
						}
						if e.Plugin != item.Plugin || e.Locked {
							kept = append(kept, e)
						}
					}
					list = kept
					continue
				}
				list = append(list, Effective{Binding: plugin.Binding{Key: fmt.Sprintf("%s@%s#%d", item.Plugin, layer.Kind, i),
					Plugin: item.Plugin, Config: item.Config, Priority: item.Priority}, Layer: layer.Kind, Source: layer.Source, Locked: item.Locked})
				continue
			}
			index := slices.IndexFunc(list, func(e Effective) bool { return e.Plugin == item.Plugin })
			if index >= 0 && list[index].Locked {
				errs = append(errs, fmt.Errorf("%s cannot change %s: it is locked by the %s", layerName(layer.Kind), item.Plugin, describe(list[index])))
				continue
			}
			if item.Disabled {
				if index >= 0 {
					list = slices.Delete(list, index, index+1)
				}
				continue
			}
			e := Effective{Binding: plugin.Binding{Plugin: item.Plugin, Config: item.Config, Priority: item.Priority},
				Layer: layer.Kind, Source: layer.Source, Locked: item.Locked}
			if index >= 0 {
				list[index] = e
			} else {
				list = append(list, e)
			}
		}
	}
	return list, errors.Join(errs...)
}

// Finalize applies the API's authentication: an authentication plugin runs only
// when auth asks for it, configured by the merged item when there is one. A
// private API must use signatures and admits only the granted applications.
func Finalize(list []Effective, auth, visibility string, granted []string) ([]Effective, error) {
	if !slices.Contains(AuthModes, auth) {
		return nil, fmt.Errorf("unknown authentication %q", auth)
	}
	if visibility == "private" && auth != "signature" {
		return nil, errors.New("a private API must use application signatures")
	}
	configured := map[string]Effective{}
	out := make([]Effective, 0, len(list)+1)
	for _, e := range list {
		if isAuthPlugin(e.Plugin) {
			configured[e.Plugin] = e
			continue
		}
		out = append(out, e)
	}
	name, ok := authPlugins[auth]
	if !ok {
		return out, nil
	}
	e, found := configured[name]
	if !found {
		if auth == "jwt" {
			return nil, errors.New("jwt authentication needs a jwt-auth item naming its secret in a policy set or the overrides")
		}
		e = Effective{Binding: plugin.Binding{Plugin: name}, Layer: Auth}
	}
	if visibility == "private" {
		config := map[string]any{}
		if len(e.Config) > 0 && string(e.Config) != "null" {
			if err := json.Unmarshal(e.Config, &config); err != nil {
				return nil, fmt.Errorf("aliyun-signature: %w", err)
			}
		}
		names := append([]string{}, granted...)
		sort.Strings(names)
		config["consumers"], config["private"] = names, true
		raw, _ := json.Marshal(config)
		e.Config = raw
	}
	return append(out, e), nil
}

// ResolveConsumer applies one application's settings over an API's effective
// policies. A setting replaces the policy for that application's requests; a
// rate limit replaces the API's unlocked rate limits for it (special quotas
// may be higher or lower). It returns the bindings the chain adds for that
// application: replacements, additions, and slots switched off.
func ResolveConsumer(stage string, base []Effective, layer Layer) ([]plugin.Binding, []Effective, error) {
	var bindings []plugin.Binding
	effective := slices.Clone(base)
	var errs []error
	stacked := false
	for i, item := range layer.Items {
		if !item.applies(stage) {
			continue
		}
		if item.Disabled || isAuthPlugin(item.Plugin) {
			errs = append(errs, fmt.Errorf("application %q: %s cannot be switched off or configured per application", layer.Source, item.Plugin))
			continue
		}
		if Stacks(item.Plugin) {
			if !stacked {
				stacked = true
				kept := effective[:0:0]
				for _, e := range effective {
					if e.Plugin == item.Plugin && !e.Locked {
						bindings = append(bindings, plugin.Binding{Key: e.Slot(), Plugin: e.Plugin, Disabled: true})
						continue
					}
					kept = append(kept, e)
				}
				effective = kept
			}
			key := fmt.Sprintf("%s@%s#%d", item.Plugin, Application, i)
			binding := plugin.Binding{Key: key, Plugin: item.Plugin, Config: item.Config, Priority: item.Priority}
			bindings = append(bindings, binding)
			effective = append(effective, Effective{Binding: binding, Layer: Application, Source: layer.Source, Locked: item.Locked})
			continue
		}
		index := slices.IndexFunc(effective, func(e Effective) bool { return e.Plugin == item.Plugin })
		if index >= 0 && effective[index].Locked {
			errs = append(errs, fmt.Errorf("application %q cannot change %s: it is locked by the %s", layer.Source, item.Plugin, describe(effective[index])))
			continue
		}
		binding := plugin.Binding{Plugin: item.Plugin, Config: item.Config, Priority: item.Priority}
		if index >= 0 {
			binding.Key = effective[index].Slot()
			effective[index] = Effective{Binding: binding, Layer: Application, Source: layer.Source, Locked: item.Locked}
		} else {
			effective = append(effective, Effective{Binding: binding, Layer: Application, Source: layer.Source, Locked: item.Locked})
		}
		bindings = append(bindings, binding)
	}
	return bindings, effective, errors.Join(errs...)
}

// Bindings are the chain's bindings of an effective list.
func Bindings(list []Effective) []plugin.Binding {
	out := make([]plugin.Binding, len(list))
	for i, e := range list {
		out[i] = e.Binding
	}
	return out
}

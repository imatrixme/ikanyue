package policy

import (
	"encoding/json"
	"strings"
	"testing"

	"kanyue.gateway/internal/plugin"
)

func item(plugin, config string) Item { return Item{Plugin: plugin, Config: json.RawMessage(config)} }

func summary(list []Effective) string {
	var parts []string
	for _, e := range list {
		parts = append(parts, e.Slot()+"<"+e.Layer+">"+string(e.Config))
	}
	return strings.Join(parts, " ")
}

// The lowest layer configuring an override-kind policy wins; every rate limit stacks.
func TestOverrideAndStackKinds(t *testing.T) {
	baseline := Layer{Kind: Baseline, Source: "baseline", Items: []Item{item("rate-limit", `{"limit":1000,"window":"minute"}`),
		item("body-limit", `{"maxBytes":1048576}`)}}
	group := Layer{Kind: GroupSet, Source: "mapi-default", Items: []Item{item("cors", `{"allowOrigins":["*"]}`),
		item("rate-limit", `{"limit":500,"window":"minute"}`)}}
	overrides := Layer{Kind: Overrides, Source: "upload", Items: []Item{item("body-limit", `{"maxBytes":20971520}`),
		item("rate-limit", `{"limit":100,"window":"minute"}`), {Plugin: "cors", Disabled: true}}}
	list, err := Resolve("RELEASE", baseline, group, Layer{Kind: APISet}, overrides)
	if err != nil {
		t.Fatal(err)
	}
	want := `rate-limit@baseline#0<baseline>{"limit":1000,"window":"minute"} body-limit<override>{"maxBytes":20971520} ` +
		`rate-limit@group#1<group>{"limit":500,"window":"minute"} rate-limit@override#1<override>{"limit":100,"window":"minute"}`
	if got := summary(list); got != want {
		t.Fatalf("effective =\n%s\nwant\n%s", got, want)
	}
	// Switching rate limits off removes the inherited unlocked ones.
	list, err = Resolve("RELEASE", baseline, Layer{Kind: Overrides, Items: []Item{{Plugin: "rate-limit", Disabled: true}}})
	if err != nil || summary(list) != `body-limit<baseline>{"maxBytes":1048576}` {
		t.Fatalf("switched off = %s %v", summary(list), err)
	}
}

// Locked items refuse changes and switches below, name the locking layer, and
// still let rate limits be added.
func TestLocks(t *testing.T) {
	locked := Layer{Kind: Baseline, Source: "baseline", Items: []Item{
		{Plugin: "ip-restriction", Config: json.RawMessage(`{"deny":["10.0.0.0/8"]}`), Locked: true},
		{Plugin: "rate-limit", Config: json.RawMessage(`{"limit":1000,"window":"minute"}`), Locked: true}}}
	for _, lower := range []Item{item("ip-restriction", `{"deny":[]}`), {Plugin: "ip-restriction", Disabled: true}, {Plugin: "rate-limit", Disabled: true}} {
		_, err := Resolve("RELEASE", locked, Layer{Kind: Overrides, Source: "x", Items: []Item{lower}})
		if err == nil || !strings.Contains(err.Error(), `locked by the platform baseline "baseline"`) {
			t.Errorf("%+v: %v", lower, err)
		}
	}
	list, err := Resolve("RELEASE", locked, Layer{Kind: GroupSet, Items: []Item{item("rate-limit", `{"limit":10,"window":"second"}`)}})
	if err != nil || len(list) != 3 {
		t.Fatalf("added rate limit = %s %v", summary(list), err)
	}
}

// Items limited to environments apply only there.
func TestStageFilters(t *testing.T) {
	layer := Layer{Kind: GroupSet, Items: []Item{{Plugin: "mock", Config: json.RawMessage(`{"status":200}`), Stages: []string{"TEST"}},
		{Plugin: "maintenance", Stages: []string{"PRE", "RELEASE"}}}}
	for stage, want := range map[string]string{"TEST": "mock", "PRE": "maintenance", "RELEASE": "maintenance"} {
		list, err := Resolve(stage, layer)
		if err != nil || len(list) != 1 || list[0].Plugin != want {
			t.Errorf("%s = %s %v", stage, summary(list), err)
		}
	}
}

// CheckLayer refuses what can be refused without the other layers.
func TestCheckLayer(t *testing.T) {
	for _, item := range []struct {
		layer Layer
		want  string
	}{
		{Layer{Kind: GroupSet, Items: []Item{item("nope", `{}`)}}, `unknown plugin "nope"`},
		{Layer{Kind: GroupSet, Items: []Item{item("rate-limit", `{"limit":0}`)}}, "window is required"},
		{Layer{Kind: GroupSet, Items: []Item{item("cors", `{}`), item("cors", `{}`)}}, "cors appears twice for TEST"},
		{Layer{Kind: GroupSet, Items: []Item{{Plugin: "cors", Stages: []string{"DEV"}}}}, `unknown environment "DEV"`},
		{Layer{Kind: Baseline, Items: []Item{{Plugin: "cors", Disabled: true}}}, "platform baseline cannot switch a policy off"},
		{Layer{Kind: Application, Items: []Item{item("jwt-auth", `{"secret":"jwt"}`)}}, "not configured per application"},
	} {
		if err := CheckLayer(item.layer); err == nil || !strings.Contains(err.Error(), item.want) {
			t.Errorf("%+v: %v, want %q", item.layer, err, item.want)
		}
	}
	cors := json.RawMessage(`{"allowOrigins":["*"]}`)
	split := Layer{Kind: GroupSet, Items: []Item{{Plugin: "cors", Config: cors, Stages: []string{"TEST"}}, {Plugin: "cors", Config: cors, Stages: []string{"RELEASE"}},
		item("rate-limit", `{"limit":1,"window":"second"}`), item("rate-limit", `{"limit":9,"window":"minute"}`)}}
	if err := CheckLayer(split); err != nil {
		t.Fatal(err)
	}
}

// Authentication applies only as the API asks, configured by the layers; a
// private API admits exactly its grants.
func TestFinalizeAuthentication(t *testing.T) {
	list := []Effective{{Binding: item2("jwt-auth", `{"secret":"jwt"}`), Layer: GroupSet}, {Binding: item2("cors", `{}`), Layer: GroupSet},
		{Binding: item2("aliyun-signature", `{"consumers":["x"]}`), Layer: Baseline}}
	for auth, want := range map[string]string{"passthrough": "cors", "none": "cors", "jwt": "cors jwt-auth",
		"signature": "cors aliyun-signature"} {
		out, err := Finalize(list, auth, "public", nil)
		if err != nil || names(out) != want {
			t.Errorf("%s = %s %v", auth, names(out), err)
		}
	}
	if _, err := Finalize(list[1:], "jwt", "public", nil); err == nil || !strings.Contains(err.Error(), "needs a jwt-auth item") {
		t.Fatalf("jwt without its secret: %v", err)
	}
	if _, err := Finalize(list, "jwt", "private", nil); err == nil || !strings.Contains(err.Error(), "must use application signatures") {
		t.Fatalf("private jwt: %v", err)
	}
	out, err := Finalize(nil, "signature", "private", []string{"zeta", "alpha"})
	if err != nil || string(out[0].Config) != `{"consumers":["alpha","zeta"],"private":true}` || out[0].Layer != Auth {
		t.Fatalf("private = %+v %v", out, err)
	}
	out, _ = Finalize(nil, "signature", "private", nil)
	if string(out[0].Config) != `{"consumers":[],"private":true}` {
		t.Fatalf("private without grants admits someone: %s", out[0].Config)
	}
}

// An application's settings replace policies for its requests, its rate limit
// replaces the unlocked ones, and locks hold.
func TestResolveConsumer(t *testing.T) {
	base, err := Resolve("RELEASE", Layer{Kind: Baseline, Items: []Item{{Plugin: "rate-limit", Config: json.RawMessage(`{"limit":5,"window":"second"}`), Locked: true}}},
		Layer{Kind: GroupSet, Items: []Item{item("rate-limit", `{"limit":100,"window":"minute"}`), item("cors", `{}`)}})
	if err != nil {
		t.Fatal(err)
	}
	bindings, effective, err := ResolveConsumer("RELEASE", base, Layer{Kind: Application, Source: "vip",
		Items: []Item{item("rate-limit", `{"limit":10000,"window":"minute","by":"consumer"}`), item("cors", `{"allowOrigins":["https://vip.example"]}`)}})
	if err != nil {
		t.Fatal(err)
	}
	var got []string
	for _, b := range bindings {
		got = append(got, b.Slot()+map[bool]string{true: "-off", false: ""}[b.Disabled])
	}
	if strings.Join(got, " ") != "rate-limit@group#0-off rate-limit@consumer#0 cors" {
		t.Fatalf("bindings = %v", got)
	}
	if summary(effective) != `rate-limit@baseline#0<baseline>{"limit":5,"window":"second"} cors<consumer>{"allowOrigins":["https://vip.example"]} `+
		`rate-limit@consumer#0<consumer>{"limit":10000,"window":"minute","by":"consumer"}` {
		t.Fatalf("effective = %s", summary(effective))
	}
	locked := []Effective{{Binding: item2("ip-restriction", `{}`), Layer: Baseline, Locked: true}}
	if _, _, err := ResolveConsumer("RELEASE", locked, Layer{Kind: Application, Source: "vip", Items: []Item{item("ip-restriction", `{}`)}}); err == nil {
		t.Fatal("application changed a locked policy")
	}
}

func item2(name, config string) plugin.Binding {
	return plugin.Binding{Plugin: name, Config: json.RawMessage(config)}
}

func names(list []Effective) string {
	var out []string
	for _, e := range list {
		out = append(out, e.Plugin)
	}
	return strings.Join(out, " ")
}

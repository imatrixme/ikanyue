package control

import (
	"net/http"
	"testing"

	"kanyue.gateway/internal/config"
)

// A second Control on the same database stands in for the other process of a
// rollout: it learns releases and instance changes only through sync.
func TestSyncAdoptsWhatAnotherProcessDid(t *testing.T) {
	c, app := newControl(t)
	upstream := newFakeService(t, manifestV1)
	service := registered(t, c, app, upstream)
	group, apis := draftGroup(t, app, "mapi", []string{"mapi.ikanyue.com"}, service.Id)
	const catalog = "http://mapi.ikanyue.com/v1/public/course-catalog"

	other := New(app, config.Config{RegistrationToken: token}, newHandler())
	if err := other.sync(); err != nil {
		t.Fatal(err)
	}
	if got := through(other, http.MethodGet, catalog, "").Code; got != http.StatusNotFound {
		t.Fatalf("nothing released yet: got %d", got)
	}

	release(t, c, "RELEASE", targetsOf(group, all(apis)...))
	if got := through(other, http.MethodGet, catalog, "").Code; got != http.StatusNotFound {
		t.Fatalf("before sync the other process keeps its snapshot: got %d", got)
	}
	if err := other.sync(); err != nil {
		t.Fatal(err)
	}
	if got, want := other.handler.Versions()["RELEASE"], c.handler.Versions()["RELEASE"]; got != want {
		t.Fatalf("RELEASE version %d, want %d", got, want)
	}
	if got := through(other, http.MethodGet, catalog, ""); got.Code != http.StatusOK {
		t.Fatalf("after sync: got %d %s", got.Code, got.Body)
	}

	// The instance leaves and comes back through the first process.
	beat := Beat{Service: upstream.name, Address: upstream.address(), Stage: "RELEASE"}
	if err := c.Deregister(beat); err != nil {
		t.Fatal(err)
	}
	if err := other.sync(); err != nil {
		t.Fatal(err)
	}
	if got := through(other, http.MethodGet, catalog, "").Code; got != http.StatusServiceUnavailable {
		t.Fatalf("instance gone: got %d", got)
	}
	if err := c.Heartbeat(beat); err != nil {
		t.Fatal(err)
	}
	if err := other.sync(); err != nil {
		t.Fatal(err)
	}
	if got := through(other, http.MethodGet, catalog, "").Code; got != http.StatusOK {
		t.Fatalf("instance back: got %d", got)
	}

	// A heartbeat that only refreshes timestamps keeps the endpoints as they are.
	endpoints := other.handler.Endpoints()
	if err := c.Heartbeat(beat); err != nil {
		t.Fatal(err)
	}
	if err := other.sync(); err != nil {
		t.Fatal(err)
	}
	if other.handler.Endpoints() != endpoints {
		t.Fatal("a timestamp-only heartbeat rebuilt the endpoints")
	}
}

package snapshot

import (
	"fmt"
	"strings"
	"testing"
	"time"
)

func lastOctet(peer *Peer) string {
	return peer.Address[len("10.0.0."):strings.Index(peer.Address, ":")]
}

// Smooth weighted round robin spreads picks by weight without bursts, per service and stage.
func TestEndpointsPickByWeightPerStage(t *testing.T) {
	endpoints, err := NewEndpoints([]Instance{
		{Service: "s", Stage: "RELEASE", Address: "10.0.0.1:80", Weight: 3},
		{Service: "s", Stage: "RELEASE", Address: "10.0.0.2:80"},
		{Service: "s", Stage: "TEST", Address: "10.0.0.9:80"},
	}, nil)
	if err != nil {
		t.Fatal(err)
	}
	service, now := &Service{ID: "s"}, time.Now()
	var sequence []string
	for range 8 {
		peer, ok := endpoints.Pick(service, "RELEASE", "", nil, now)
		if !ok {
			t.Fatal("no release instance")
		}
		sequence = append(sequence, lastOctet(peer))
	}
	if got := strings.Join(sequence, ""); got != "11211121" {
		t.Fatalf("sequence = %s", got)
	}
	if peer, _ := endpoints.Pick(service, "TEST", "", nil, now); peer.Address != "10.0.0.9:80" {
		t.Fatalf("test stage = %v", peer)
	}
	if _, ok := endpoints.Pick(service, "PRE", "", nil, now); ok || endpoints.Has("s", "PRE") {
		t.Fatal("picked for a stage without instances")
	}
	if _, err := NewEndpoints([]Instance{{Service: "s", Stage: "RELEASE", Address: "10.0.0.1:80/evil"}}, nil); err == nil {
		t.Fatal("accepted an address with a path")
	}
}

func threePeers(t *testing.T, prev *Endpoints) *Endpoints {
	t.Helper()
	var instances []Instance
	for i := 1; i <= 3; i++ {
		instances = append(instances, Instance{Service: "s", Stage: "RELEASE", Address: fmt.Sprintf("10.0.0.%d:80", i)})
	}
	endpoints, err := NewEndpoints(instances, prev)
	if err != nil {
		t.Fatal(err)
	}
	return endpoints
}

// The hash balancer keeps a key on one peer, moves only that peer's keys when it
// leaves; least-inflight prefers the idlest peer.
func TestHashAndLeastInflightBalancing(t *testing.T) {
	endpoints, now := threePeers(t, nil), time.Now()
	hash := &Service{ID: "s", Balancer: "hash"}
	owner := map[string]*Peer{}
	for i := range 60 {
		key := fmt.Sprintf("user-%d", i)
		first, _ := endpoints.Pick(hash, "RELEASE", key, nil, now)
		again, _ := endpoints.Pick(hash, "RELEASE", key, nil, now)
		if first != again {
			t.Fatalf("key %s moved between picks", key)
		}
		owner[key] = first
	}
	gone, _ := endpoints.Pick(hash, "RELEASE", "user-0", nil, now)
	gone.down.Store(true)
	moved := 0
	for key, peer := range owner {
		now, _ := endpoints.Pick(hash, "RELEASE", key, nil, time.Now())
		if peer != gone && now != peer {
			moved++
		}
		if now == gone {
			t.Fatal("picked a down peer")
		}
	}
	if moved != 0 {
		t.Fatalf("%d keys of healthy peers moved", moved)
	}
	gone.down.Store(false)

	least := &Service{ID: "s", Balancer: "least-inflight"}
	busy, _ := endpoints.Pick(least, "RELEASE", "", nil, now)
	release := busy.Acquire()
	defer release()
	for range 5 {
		if peer, _ := endpoints.Pick(least, "RELEASE", "", nil, now); peer == busy {
			t.Fatal("least-inflight picked the busy peer")
		}
	}
}

// Passive failures eject a peer for a growing pause, never the last healthy
// one; active checks flip a peer after Threshold results; health survives a rebuild.
func TestPassiveEjectionAndActiveChecks(t *testing.T) {
	endpoints, now := threePeers(t, nil), time.Now()
	service := &Service{ID: "s", PassiveFailures: 2}
	peer, _ := endpoints.Pick(service, "RELEASE", "", nil, now)
	endpoints.Report(service, "RELEASE", peer, true, now)
	if !peer.Healthy(now) {
		t.Fatal("ejected after one failure")
	}
	endpoints.Report(service, "RELEASE", peer, true, now)
	if peer.Healthy(now) || !peer.Healthy(now.Add(ejectBase)) {
		t.Fatal("not ejected for the base pause")
	}
	endpoints.Report(service, "RELEASE", peer, true, now)
	endpoints.Report(service, "RELEASE", peer, true, now)
	if peer.Healthy(now.Add(ejectBase)) {
		t.Fatal("second ejection did not double the pause")
	}

	rebuilt := threePeers(t, endpoints)
	if healthy, total := rebuilt.Healthy("s", now); healthy != 2 || total != 3 {
		t.Fatalf("health lost in rebuild: %d/%d", healthy, total)
	}
	for _, other := range rebuilt.pools[poolKey("s", "RELEASE")].peers {
		if other.Address != peer.Address {
			for range 10 {
				rebuilt.Report(service, "RELEASE", other, true, now)
			}
		}
	}
	if healthy, _ := rebuilt.Healthy("s", now); healthy != 1 {
		t.Fatalf("the last healthy peer was ejected: %d healthy", healthy)
	}

	checked := &Service{ID: "s", Health: &HealthCheck{Path: "/ready", IntervalSeconds: 5, Threshold: 2}}
	fresh, _ := NewEndpoints([]Instance{{Service: "s", Stage: "RELEASE", Address: "10.0.0.8:80"}}, nil)
	due := fresh.Due(checked, now)
	if len(due) != 1 || len(fresh.Due(checked, now.Add(time.Second))) != 0 || len(fresh.Due(checked, now.Add(5*time.Second))) != 1 {
		t.Fatal("checks not scheduled by interval")
	}
	if due[0].Checked(false, 2) || !due[0].Checked(false, 2) || due[0].Healthy(now) {
		t.Fatal("two failed checks did not take the peer down")
	}
	if due[0].Checked(true, 2) || !due[0].Checked(true, 2) || !due[0].Healthy(now) {
		t.Fatal("two passed checks did not bring the peer back")
	}
}

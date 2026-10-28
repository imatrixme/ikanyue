package control

import (
	"errors"
	"fmt"
	"slices"
	"strings"
	"time"

	"kanyue.gateway/internal/policy"
	"kanyue.gateway/internal/snapshot"
)

// syncInterval bounds how long a process lags the releases and instance changes
// another process makes on the same data directory, e.g. while a rollout runs
// the primary and the standby side by side.
const syncInterval = 5 * time.Second

// sync adopts newer released versions and routing changes recorded by other
// processes. A process's own releases and heartbeats already apply directly.
func (c *Control) sync() error {
	served := c.handler.Versions()
	var failures []error
	for _, stage := range policy.Stages {
		record, err := latestStageVersion(c.app, stage)
		if errors.Is(err, errNoVersion) {
			continue
		}
		if err != nil {
			failures = append(failures, err)
			continue
		}
		version := record.GetInt("version")
		if version <= served[stage] {
			continue
		}
		routes, err := c.loadStage(stage)
		if err == nil {
			err = c.handler.SetStage(routes)
		}
		if err != nil {
			failures = append(failures, fmt.Errorf("%s v%d: %w", stage, version, err))
			continue
		}
		c.app.Logger().Info("Serving a version released by another process", "stage", stage, "version", version)
	}
	if instances, err := c.routableInstances(); err != nil {
		failures = append(failures, err)
	} else if routableKey(instances) != c.routable {
		failures = append(failures, c.rebuildEndpoints())
	}
	return errors.Join(failures...)
}

// routableKey fingerprints what routing depends on, so heartbeats that only
// refresh timestamps do not rebuild the endpoints.
func routableKey(instances []snapshot.Instance) string {
	lines := make([]string, 0, len(instances))
	for _, instance := range instances {
		lines = append(lines, fmt.Sprintf("%s|%s|%s|%d", instance.Service, instance.Stage, instance.Address, instance.Weight))
	}
	slices.Sort(lines)
	return strings.Join(lines, "\n")
}

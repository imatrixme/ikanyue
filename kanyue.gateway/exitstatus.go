package main

import (
	"sync/atomic"

	"github.com/spf13/cobra"
)

// exitOnFailure reports whether the command that ran failed. PocketBase's
// Execute discards the errors commands return, so without it a failed serve
// start, migration or key rotation exits 0 and scripts take it for success.
func exitOnFailure(root *cobra.Command) (failed func() bool) {
	var flag atomic.Bool
	// Initializers run once the tree is complete (PocketBase adds serve and
	// superuser in Start), just before the chosen command checks its arguments.
	cobra.OnInitialize(func() { recordFailures(root, &flag) })
	return flag.Load
}

// recordFailures wraps every command's argument check and RunE to note an error.
func recordFailures(c *cobra.Command, failed *atomic.Bool) {
	note := func(err error) error {
		if err != nil {
			failed.Store(true)
		}
		return err
	}
	if args := c.Args; args != nil {
		c.Args = func(cmd *cobra.Command, a []string) error { return note(args(cmd, a)) }
	}
	if run := c.RunE; run != nil {
		c.RunE = func(cmd *cobra.Command, a []string) error { return note(run(cmd, a)) }
	}
	for _, child := range c.Commands() {
		recordFailures(child, failed)
	}
}

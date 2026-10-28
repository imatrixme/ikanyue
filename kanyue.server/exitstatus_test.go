package main

import (
	"errors"
	"io"
	"sync/atomic"
	"testing"

	"github.com/spf13/cobra"
)

// A command that returns an error, or is called with the wrong arguments, is
// noted as failed; a nested command that succeeds is not.
func TestRecordFailures(t *testing.T) {
	run := func(args ...string) bool {
		root := &cobra.Command{Use: "app"}
		root.SetOut(io.Discard)
		root.SetErr(io.Discard)
		group := &cobra.Command{Use: "group"}
		group.AddCommand(&cobra.Command{Use: "ok", RunE: func(*cobra.Command, []string) error { return nil }},
			&cobra.Command{Use: "fail", RunE: func(*cobra.Command, []string) error { return errors.New("boom") }},
			&cobra.Command{Use: "one", Args: cobra.ExactArgs(1), RunE: func(*cobra.Command, []string) error { return nil }})
		root.AddCommand(group)
		var failed atomic.Bool
		recordFailures(root, &failed)
		root.SetArgs(args)
		root.Execute()
		return failed.Load()
	}
	for _, c := range []struct {
		args []string
		want bool
	}{{[]string{"group", "ok"}, false}, {[]string{"group", "fail"}, true}, {[]string{"group", "one"}, true},
		{[]string{"group", "one", "x"}, false}} {
		if got := run(c.args...); got != c.want {
			t.Errorf("%v failed = %v, want %v", c.args, got, c.want)
		}
	}
}

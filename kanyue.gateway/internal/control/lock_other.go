//go:build !unix

package control

import "os"

// lockDataDir is a no-op where flock is unavailable; stop the gateway by hand
// before rotating the key there.
func lockDataDir(string, bool) (*os.File, error) { return nil, nil }

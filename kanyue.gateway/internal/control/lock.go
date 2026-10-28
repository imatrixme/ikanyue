//go:build unix

package control

import (
	"errors"
	"os"
	"path/filepath"
	"syscall"
)

// lockDataDir takes the data directory lock: serving processes share it, so a
// rollout's primary and standby run side by side, while commands that rewrite
// secrets need it alone. The lock lives as long as the returned file is open.
func lockDataDir(dir string, exclusive bool) (*os.File, error) {
	file, err := os.OpenFile(filepath.Join(dir, "gateway.lock"), os.O_CREATE|os.O_RDWR, 0o600)
	if err != nil {
		return nil, err
	}
	how := syscall.LOCK_SH
	if exclusive {
		how = syscall.LOCK_EX
	}
	if err := syscall.Flock(int(file.Fd()), how|syscall.LOCK_NB); err != nil {
		file.Close()
		if errors.Is(err, syscall.EWOULDBLOCK) {
			return nil, errDataDirBusy
		}
		return nil, err
	}
	return file, nil
}

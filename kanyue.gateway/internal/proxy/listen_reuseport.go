//go:build linux || darwin

package proxy

import (
	"context"
	"net"
	"syscall"
)

func listen(addr string) (net.Listener, error) {
	config := net.ListenConfig{Control: func(_, _ string, conn syscall.RawConn) error {
		var optErr error
		if err := conn.Control(func(fd uintptr) {
			optErr = syscall.SetsockoptInt(int(fd), syscall.SOL_SOCKET, syscall.SO_REUSEPORT, 1)
		}); err != nil {
			return err
		}
		return optErr
	}}
	return config.Listen(context.Background(), "tcp", addr)
}

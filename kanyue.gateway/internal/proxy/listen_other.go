//go:build !(linux || darwin)

package proxy

import "net"

func listen(addr string) (net.Listener, error) {
	return net.Listen("tcp", addr)
}

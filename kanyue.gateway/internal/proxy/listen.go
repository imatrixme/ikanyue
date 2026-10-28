package proxy

import (
	"context"
	"errors"
	"net/http"
	"time"
)

// Server is the data plane listener.
type Server struct {
	http *http.Server
}

// Serve starts the data plane on addr. The socket uses SO_REUSEPORT where the
// platform has it, so a new binary can bind before the old one drains.
func Serve(addr string, handler http.Handler, onError func(error)) (*Server, error) {
	listener, err := listen(addr)
	if err != nil {
		return nil, err
	}
	var protocols http.Protocols
	protocols.SetHTTP1(true)
	protocols.SetUnencryptedHTTP2(true)
	s := &Server{http: &http.Server{
		Handler:           handler,
		Protocols:         &protocols,
		ReadHeaderTimeout: 10 * time.Second,
		IdleTimeout:       120 * time.Second,
		MaxHeaderBytes:    1 << 20,
	}}
	go func() {
		if err := s.http.Serve(listener); err != nil && !errors.Is(err, http.ErrServerClosed) {
			onError(err)
		}
	}()
	return s, nil
}

// Shutdown stops accepting and waits for in-flight requests up to timeout.
// Hijacked connections (WebSocket) are not tracked by net/http and are cut when the process exits.
func (s *Server) Shutdown(timeout time.Duration) error {
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	return s.http.Shutdown(ctx)
}

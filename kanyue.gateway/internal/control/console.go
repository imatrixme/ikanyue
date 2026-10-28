package control

import (
	"io/fs"
	"net/http"
	"path"
	"strings"

	"github.com/pocketbase/pocketbase/core"
)

// consoleCSP keeps the console to its own bundle and the admin API next to it.
const consoleCSP = "default-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"

// consolePages serves the embedded console under /console/: hashed assets are
// cached for good, every other path gets index.html for client-side routing.
func consolePages(site fs.FS) func(*core.RequestEvent) error {
	return func(e *core.RequestEvent) error {
		if _, err := fs.Stat(site, "index.html"); err != nil {
			return e.NotFoundError("The console is not built.", nil)
		}
		header := e.Response.Header()
		header.Set("Content-Security-Policy", consoleCSP)
		header.Set("X-Content-Type-Options", "nosniff")
		header.Set("Referrer-Policy", "no-referrer")
		name := strings.TrimPrefix(path.Clean("/"+e.Request.PathValue("path")), "/")
		if info, err := fs.Stat(site, name); err == nil && !info.IsDir() && name != "index.html" {
			if strings.HasPrefix(name, "assets/") {
				header.Set("Cache-Control", "public, max-age=31536000, immutable")
			}
			return e.FileFS(site, name)
		}
		if strings.HasPrefix(name, "assets/") {
			return e.NotFoundError("", nil)
		}
		header.Set("Cache-Control", "no-cache")
		return e.FileFS(site, "index.html")
	}
}

func bindConsole(se *core.ServeEvent, site fs.FS) {
	se.Router.GET("/console", func(e *core.RequestEvent) error {
		return e.Redirect(http.StatusFound, "/console/")
	})
	se.Router.GET("/console/{path...}", consolePages(site))
}

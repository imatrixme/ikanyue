// Package console embeds the built ikanyue.admin SPA. `npm run build:server` in
// ikanyue.admin (or the Docker build) fills site/; without it the server still
// runs and every page path answers with the 404 envelope.
package console

import (
	"embed"
	"io/fs"
)

//go:embed all:site
var embedded embed.FS

// FS is the admin build root (index.html, assets/...).
func FS() fs.FS {
	site, _ := fs.Sub(embedded, "site")
	return site
}

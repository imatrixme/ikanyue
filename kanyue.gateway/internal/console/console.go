// Package console embeds the built gateway console (React, in ../../console).
// `npm run build` there fills site/; without it the gateway still runs and
// /console/ answers 404.
package console

import (
	"embed"
	"io/fs"
)

//go:embed all:site
var embedded embed.FS

// FS is the console build root (index.html, assets/...).
func FS() fs.FS {
	site, _ := fs.Sub(embedded, "site")
	return site
}

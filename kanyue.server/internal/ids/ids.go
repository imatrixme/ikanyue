// Package ids generates the identifiers Hono generated, so records written by
// either server look the same.
package ids

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
)

// UUID is an RFC 4122 version 4 UUID (licia/uuid, crypto.randomUUID).
func UUID() string {
	var b [16]byte
	_, _ = rand.Read(b[:])
	b[6] = (b[6] & 0x0f) | 0x40
	b[8] = (b[8] & 0x3f) | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:])
}

// Record is a 15-char lowercase hex PocketBase id (Hono's createRecordId).
func Record() string {
	var b [12]byte
	_, _ = rand.Read(b[:])
	return hex.EncodeToString(b[:])[:15]
}

package records

import (
	"testing"

	"github.com/pocketbase/pocketbase/core"
)

// Hono: fileUrl › getFileUrl handles empty values, absolute URLs, public asset, and PocketBase URLs
func TestFileURL(t *testing.T) {
	collection := core.NewBaseCollection("materials")
	collection.Id = "materials"
	record := core.NewRecord(collection)
	record.Id = "material_1"

	for _, tc := range []struct{ filename, asset, pb, want string }{
		{"", "https://oss.example.com/assets", "https://pb.example.com", ""},
		{"https://cdn.example.com/file.mp3", "", "", "https://cdn.example.com/file.mp3"},
		{"http://cdn.example.com/file.mp3", "", "", "http://cdn.example.com/file.mp3"},
		{"audio.mp3", "https://oss.example.com/assets/", "https://pb.example.com", "https://oss.example.com/assets/materials/material_1/audio.mp3"},
		{"audio.mp3", " ", "https://pb.example.com/", "https://pb.example.com/api/files/materials/material_1/audio.mp3"},
		{"audio.mp3", "", "", ""},
	} {
		if got := FileURL(record, tc.filename, tc.asset, tc.pb); got != tc.want {
			t.Fatalf("FileURL(%q, %q, %q) = %q", tc.filename, tc.asset, tc.pb, got)
		}
	}
}

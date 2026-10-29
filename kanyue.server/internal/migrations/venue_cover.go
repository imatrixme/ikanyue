package migrations

import (
	"database/sql"
	"errors"

	"github.com/pocketbase/pocketbase/core"
)

// VenueCoverMaxSize bounds the optional venue cover the mini program home shows as its header.
const VenueCoverMaxSize = 5 * 1024 * 1024

// VenueCoverTypes are the cover formats WeChat renders everywhere.
var VenueCoverTypes = []string{"image/jpeg", "image/png", "image/webp"}

// addVenueCover adds the optional cover image to venues; existing venues keep no cover.
func addVenueCover(txApp core.App) error {
	collection, err := txApp.FindCollectionByNameOrId("venues")
	if errors.Is(err, sql.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	if collection.Fields.GetByName("cover") != nil {
		return nil
	}
	collection.Fields.Add(&core.FileField{Name: "cover", MaxSelect: 1, MaxSize: VenueCoverMaxSize, MimeTypes: VenueCoverTypes})
	return txApp.Save(collection)
}

// Package venues serves the studio venue list. Field shapes match Hono's venueService.
package venues

import (
	"github.com/pocketbase/pocketbase/core"

	"kanyue.server/internal/httpx"
)

const collection = "venues"

type publicVenue struct {
	Address      string `json:"address"`
	Bookable     bool   `json:"bookable"`
	ID           string `json:"id"`
	Intro        string `json:"intro"`
	Name         string `json:"name"`
	OpeningHours string `json:"openingHours"`
	Phone        string `json:"phone"`
}

type listResult struct {
	Items []publicVenue `json:"items"`
}

func Register(se *core.ServeEvent) {
	se.Router.GET("/v1/public/venues", func(e *core.RequestEvent) error {
		result, err := ListPublic(e.App)
		if err != nil {
			e.App.Logger().Error("list public venues", "error", err)
			return httpx.Error(e, 500, "服务器内部错误")
		}
		return httpx.Data(e, result)
	})
}

// ListPublic returns active venues by sort order, display fields only.
func ListPublic(app core.App) (listResult, error) {
	records, err := app.FindRecordsByFilter(collection, `status = "active"`, "sortOrder", 200, 0)
	if err != nil {
		return listResult{}, err
	}
	items := make([]publicVenue, 0, len(records))
	for _, record := range records {
		items = append(items, publicVenue{
			Address:      record.GetString("address"),
			Bookable:     record.GetBool("bookable"),
			ID:           record.Id,
			Intro:        record.GetString("intro"),
			Name:         record.GetString("name"),
			OpeningHours: record.GetString("openingHours"),
			Phone:        record.GetString("phone"),
		})
	}
	return listResult{Items: items}, nil
}

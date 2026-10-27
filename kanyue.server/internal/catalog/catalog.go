// Package catalog serves the public course catalog for the website and mini program.
// Projection rules match Hono's PublicCourseCatalogService.
package catalog

import (
	"log"
	"net/http"
	"sort"
	"time"

	"github.com/pocketbase/pocketbase/core"
)

type Module struct {
	Now func() time.Time
}

type course struct {
	Code            string   `json:"code"`
	DeliveryMode    string   `json:"deliveryMode"`
	DurationMinutes float64  `json:"durationMinutes"`
	Name            string   `json:"name"`
	PackageCodes    []string `json:"packageCodes"`
	TeacherTier     string   `json:"teacherTier"`
}

type courseDetail struct {
	course
	Packages []pkg `json:"packages"`
}

type grant struct {
	CourseCode *string `json:"courseCode"`
	CourseName *string `json:"courseName"`
	CreditName string  `json:"creditName"`
	Quantity   float64 `json:"quantity"`
	UnitLabel  string  `json:"unitLabel"`
}

type price struct {
	Currency   string  `json:"currency"`
	ListAmount float64 `json:"listAmount"`
	SaleAmount float64 `json:"saleAmount"`
}

type validity struct {
	ActivationDeadlineDays float64 `json:"activationDeadlineDays"`
	ActivationMode         string  `json:"activationMode"`
	ExpiryPolicy           string  `json:"expiryPolicy"`
	ValidityDurationDays   float64 `json:"validityDurationDays"`
}

type pkg struct {
	Code         string   `json:"code"`
	Description  string   `json:"description"`
	Grants       []grant  `json:"grants"`
	Name         string   `json:"name"`
	Price        price    `json:"price"`
	PurchaseMode string   `json:"purchaseMode"`
	Validity     validity `json:"validity"`
}

type Catalog struct {
	Courses  []course `json:"courses"`
	Packages []pkg    `json:"packages"`
}

type failure struct {
	Code      int    `json:"code"`
	Message   string `json:"message"`
	Data      any    `json:"data"`
	ErrorCode string `json:"errorCode"`
}

func (m Module) Register(se *core.ServeEvent) {
	se.Router.GET("/v1/public/course-catalog", m.handle(func(c Catalog, _ *core.RequestEvent) (any, *failure) {
		return c, nil
	}))
	se.Router.GET("/v1/public/course-catalog/courses/{code}", m.handle(func(c Catalog, e *core.RequestEvent) (any, *failure) {
		code := e.Request.PathValue("code")
		for _, item := range c.Courses {
			if item.Code == code {
				detail := courseDetail{course: item, Packages: []pkg{}}
				for _, p := range c.Packages {
					if contains(item.PackageCodes, p.Code) {
						detail.Packages = append(detail.Packages, p)
					}
				}
				return detail, nil
			}
		}
		return nil, &failure{Code: 404, Message: "公开课程不存在", ErrorCode: "PUBLIC_COURSE_NOT_FOUND"}
	}))
	se.Router.GET("/v1/public/course-catalog/packages/{code}", m.handle(func(c Catalog, e *core.RequestEvent) (any, *failure) {
		code := e.Request.PathValue("code")
		for _, p := range c.Packages {
			if p.Code == code {
				return p, nil
			}
		}
		return nil, &failure{Code: 404, Message: "公开课包不存在", ErrorCode: "PUBLIC_PACKAGE_NOT_FOUND"}
	}))
}

func (m Module) handle(query func(Catalog, *core.RequestEvent) (any, *failure)) func(*core.RequestEvent) error {
	return func(e *core.RequestEvent) error {
		now := time.Now()
		if m.Now != nil {
			now = m.Now()
		}
		catalog, err := Build(e.App, now)
		if err != nil {
			log.Printf("public catalog: %v", err)
			return e.JSON(http.StatusOK, failure{Code: 500, Message: "公开课程暂时不可用", ErrorCode: "PUBLIC_CATALOG_UNAVAILABLE"})
		}
		data, fail := query(catalog, e)
		if fail != nil {
			return e.JSON(http.StatusOK, fail)
		}
		return e.JSON(http.StatusOK, map[string]any{"code": 10000, "message": nil, "data": data})
	}
}

// Build projects active courses and packages; packages without a current price are hidden.
func Build(app core.App, now time.Time) (Catalog, error) {
	load := func(name, filter, sort string) ([]*core.Record, error) {
		return app.FindRecordsByFilter(name, filter, sort, 0, 0)
	}
	courseSpecs, err := load("course_specs", `status="active"`, "name,code")
	if err != nil {
		return Catalog{}, err
	}
	packages, err := load("packages", `status="active"`, "name,code")
	if err != nil {
		return Catalog{}, err
	}
	creditTypes, err := load("credit_types", `status="active"`, "kind,name")
	if err != nil {
		return Catalog{}, err
	}
	grantLines, err := load("package_grant_lines", "", "packageId,creditTypeId")
	if err != nil {
		return Catalog{}, err
	}
	priceVersions, err := load("price_versions", `status="active"`, "packageId,-validFrom,-version")
	if err != nil {
		return Catalog{}, err
	}

	coursesByID := map[string]*core.Record{}
	for _, record := range courseSpecs {
		coursesByID[record.Id] = record
	}
	creditsByID := map[string]*core.Record{}
	for _, record := range creditTypes {
		creditsByID[record.Id] = record
	}

	result := Catalog{Courses: []course{}, Packages: []pkg{}}
	for _, record := range packages {
		current := currentPrice(record.Id, priceVersions, now)
		if current == nil {
			continue
		}
		item := pkg{
			Code:        record.GetString("code"),
			Description: record.GetString("description"),
			Grants:      []grant{},
			Name:        record.GetString("name"),
			Price: price{
				Currency:   current.GetString("currency"),
				ListAmount: current.GetFloat("listAmount"),
				SaleAmount: current.GetFloat("saleAmount"),
			},
			PurchaseMode: "contact",
			Validity: validity{
				ActivationDeadlineDays: record.GetFloat("activationDeadlineDays"),
				ActivationMode:         record.GetString("activationMode"),
				ExpiryPolicy:           record.GetString("expiryPolicy"),
				ValidityDurationDays:   record.GetFloat("validityDurationDays"),
			},
		}
		if channel := record.GetString("saleChannel"); channel == "wechat" || channel == "all" {
			item.PurchaseMode = "mini_program"
		}
		for _, line := range grantLines {
			if line.GetString("packageId") != record.Id {
				continue
			}
			credit := creditsByID[line.GetString("creditTypeId")]
			if credit == nil {
				continue
			}
			entry := grant{
				CreditName: credit.GetString("name"),
				Quantity:   line.GetFloat("quantity"),
				UnitLabel:  credit.GetString("unitLabel"),
			}
			if entry.UnitLabel == "" {
				entry.UnitLabel = "课点"
			}
			if spec := coursesByID[credit.GetString("courseSpecId")]; spec != nil {
				entry.CourseCode = nonEmpty(spec.GetString("code"))
				entry.CourseName = nonEmpty(spec.GetString("name"))
			}
			item.Grants = append(item.Grants, entry)
		}
		result.Packages = append(result.Packages, item)
	}

	packageCodes := map[string][]string{}
	for _, item := range result.Packages {
		seen := map[string]bool{}
		for _, g := range item.Grants {
			if g.CourseCode == nil || seen[*g.CourseCode] {
				continue
			}
			seen[*g.CourseCode] = true
			packageCodes[*g.CourseCode] = append(packageCodes[*g.CourseCode], item.Code)
		}
	}
	for _, record := range courseSpecs {
		code := record.GetString("code")
		codes := packageCodes[code]
		if codes == nil {
			codes = []string{}
		}
		result.Courses = append(result.Courses, course{
			Code:            code,
			DeliveryMode:    record.GetString("deliveryMode"),
			DurationMinutes: record.GetFloat("durationMinutes"),
			Name:            record.GetString("name"),
			PackageCodes:    codes,
			TeacherTier:     record.GetString("teacherTier"),
		})
	}
	return result, nil
}

// currentPrice picks the newest valid price version (validFrom desc, then version desc).
func currentPrice(packageID string, prices []*core.Record, now time.Time) *core.Record {
	candidates := []*core.Record{}
	for _, entry := range prices {
		if entry.GetString("packageId") != packageID {
			continue
		}
		validFrom := entry.GetDateTime("validFrom")
		if validFrom.IsZero() || validFrom.Time().After(now) {
			continue
		}
		if validTo := entry.GetDateTime("validTo"); !validTo.IsZero() && validTo.Time().Before(now) {
			continue
		}
		candidates = append(candidates, entry)
	}
	sort.SliceStable(candidates, func(i, j int) bool {
		left, right := candidates[i].GetDateTime("validFrom").Time(), candidates[j].GetDateTime("validFrom").Time()
		if !left.Equal(right) {
			return left.After(right)
		}
		return candidates[i].GetFloat("version") > candidates[j].GetFloat("version")
	})
	if len(candidates) == 0 {
		return nil
	}
	return candidates[0]
}

func nonEmpty(value string) *string {
	if value == "" {
		return nil
	}
	return &value
}

func contains(items []string, value string) bool {
	for _, item := range items {
		if item == value {
			return true
		}
	}
	return false
}

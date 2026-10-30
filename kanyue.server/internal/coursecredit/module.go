package coursecredit

import (
	"time"

	"github.com/pocketbase/pocketbase/core"

	"kanyue.server/internal/auth"
)

// CatalogModule serves the ops course catalog: course specs, credit types,
// packages, grant lines, price versions and conversion rules (reads and admin writes).
type CatalogModule struct {
	Signer *auth.Signer
}

// catalogReads maps query routes to resources; all need the finance capability.
var catalogReads = []struct{ path, resource string }{
	{"/ops/course-credits/catalog/course-specs", "courseSpecs"},
	{"/ops/course-credits/catalog/credit-types", "creditTypes"},
	{"/ops/course-credits/packages", "packages"},
	{"/ops/course-credits/package-grant-lines", "grantLines"},
	{"/ops/course-credits/price-versions", "priceVersions"},
	{"/ops/course-credits/conversion-rules", "conversionRules"},
}

// catalogWrites maps /ops/course-operations paths to resources; grant lines have no status.
var catalogWrites = []struct {
	path, resource string
	status         bool
}{
	{"course-specs", "courseSpecs", true},
	{"packages", "packages", true},
	{"grant-lines", "grantLines", false},
	{"price-versions", "priceVersions", true},
	{"conversion-rules", "conversionRules", true},
}

func (m CatalogModule) Register(se *core.ServeEvent) {
	ops := func(handler func(*core.RequestEvent) error) func(*core.RequestEvent) error {
		return m.Signer.RequireOps(false, handler)
	}
	for _, route := range catalogReads {
		name := route.resource
		se.Router.GET(route.path, ops(func(e *core.RequestEvent) error {
			return Query(e, func() (any, error) {
				if err := RequireCapability(auth.User(e), Finance); err != nil {
					return nil, err
				}
				return listResource(e.App, name, queryParams(e, listQueryNames...))
			})
		}))
		se.Router.GET(route.path+"/{id}", ops(func(e *core.RequestEvent) error {
			return Query(e, func() (any, error) {
				if err := RequireCapability(auth.User(e), Finance); err != nil {
					return nil, err
				}
				return getResource(e.App, name, e.Request.PathValue("id"))
			})
		}))
	}
	for _, route := range catalogWrites {
		name := route.resource
		base := "/ops/course-operations/" + route.path
		se.Router.POST(base, ops(func(e *core.RequestEvent) error {
			return Command(e, "create"+name, func() (map[string]any, error) {
				body, err := financeBody(e)
				if err != nil {
					return nil, err
				}
				return createResource(e.App, name, actorOf(e), body)
			})
		}))
		se.Router.PATCH(base+"/{id}", ops(func(e *core.RequestEvent) error {
			return Command(e, "update"+name, func() (map[string]any, error) {
				body, err := financeBody(e)
				if err != nil {
					return nil, err
				}
				return updateResource(e.App, name, e.Request.PathValue("id"), actorOf(e), body, nil)
			})
		}))
		if route.status {
			se.Router.POST(base+"/{id}/status", ops(func(e *core.RequestEvent) error {
				return Command(e, "set"+name+"Status", func() (map[string]any, error) {
					body, err := financeBody(e)
					if err != nil {
						return nil, err
					}
					return setStatus(e.App, name, e.Request.PathValue("id"), body.Get("status"), body.Get("reason"), actorOf(e))
				})
			}))
		}
	}
}

// FollowUpsModule serves student renewal follow-ups; /ops/students lives in package students.
type FollowUpsModule struct {
	Signer *auth.Signer
}

func (m FollowUpsModule) Register(se *core.ServeEvent) {
	path := "/ops/course-credits/students/{studentId}/follow-ups"
	se.Router.GET(path, m.Signer.RequireOps(false, func(e *core.RequestEvent) error {
		return Query(e, func() (any, error) {
			if err := RequireCapability(auth.User(e), Finance); err != nil {
				return nil, err
			}
			items, err := listFollowUps(e.App, []string{e.Request.PathValue("studentId")})
			if err != nil {
				return nil, err
			}
			return map[string]any{"items": items}, nil
		})
	}))
	se.Router.POST(path, m.Signer.RequireOps(false, func(e *core.RequestEvent) error {
		return Command(e, "recordStudentFollowUp", func() (map[string]any, error) {
			body, err := financeBody(e)
			if err != nil {
				return nil, err
			}
			return recordFollowUp(e.App, e.Request.PathValue("studentId"), body, actorOf(e), time.Now().Truncate(time.Millisecond))
		})
	}))
}

// financeBody checks the finance capability before reading the body, in Hono's order.
func financeBody(e *core.RequestEvent) (Body, error) {
	if err := RequireCapability(auth.User(e), Finance); err != nil {
		return Body{}, err
	}
	return ReadJSONBody(e)
}

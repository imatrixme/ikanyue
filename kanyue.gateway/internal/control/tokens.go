package control

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"net/http"
	"slices"
	"strings"
	"time"

	"github.com/pocketbase/dbx"
	validation "github.com/pocketbase/ozzo-validation/v4"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/types"

	"kanyue.gateway/internal/policy"
	"kanyue.gateway/internal/schema"
)

// Machine tokens let automation call /gateway/v1 with a role: viewer reads,
// releaser also releases to its environments, admin does everything the admin
// API offers. Only a hash is stored; the token is shown once. Superusers act
// as admin. Tokens never reach the PocketBase collections API.

const tokenPrefix = "kgt_"

// Principal is who calls the admin API.
type Principal struct {
	Actor  string
	Role   string
	Stages []string // where a releaser may release
}

func rank(role string) int { return slices.Index(schema.Roles, role) }

func (p Principal) can(role string) bool { return p.Role != "" && rank(p.Role) >= rank(role) }

func (p Principal) canRelease(stage string) bool {
	return p.Role == "admin" || p.Role == "releaser" && slices.Contains(p.Stages, stage)
}

const principalKey = "gateway.principal"

func principalOf(e *core.RequestEvent) Principal {
	p, _ := e.Get(principalKey).(Principal)
	return p
}

func hashToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

// require admits superusers and tokens holding at least role; refusals of
// tokens are audited.
func (c *Control) require(role string) func(*core.RequestEvent) error {
	return func(e *core.RequestEvent) error {
		p, err := c.principal(e)
		if err != nil {
			return e.UnauthorizedError(err.Error(), nil)
		}
		if !p.can(role) {
			return c.refuse(e, p, "the "+p.Role+" role cannot call this")
		}
		e.Set(principalKey, p)
		return e.Next()
	}
}

// mayRelease refuses a release, offline, rollback or approval in an
// environment the caller's token is not allowed to change.
func (c *Control) mayRelease(e *core.RequestEvent, stage string) error {
	p := principalOf(e)
	if policy.ValidStage(stage) && !p.canRelease(stage) {
		return c.refuse(e, p, "not allowed to release to "+stage)
	}
	return nil
}

func (c *Control) refuse(e *core.RequestEvent, p Principal, reason string) error {
	c.audit(p.Actor, "refused", "admin-api", "", map[string]any{"method": e.Request.Method, "path": e.Request.URL.Path, "reason": reason})
	return e.ForbiddenError(reason, nil)
}

func (c *Control) principal(e *core.RequestEvent) (Principal, error) {
	if e.Auth != nil && e.Auth.IsSuperuser() {
		return Principal{Actor: actorOf(e.Auth), Role: "admin"}, nil
	}
	token := strings.TrimPrefix(e.Request.Header.Get("Authorization"), "Bearer ")
	if !strings.HasPrefix(token, tokenPrefix) {
		return Principal{}, errors.New("Sign in as a superuser or send a gateway token.")
	}
	record, err := c.app.FindFirstRecordByData(schema.AdminTokens, "hash", hashToken(token))
	if err != nil {
		return Principal{}, errors.New("The gateway token is unknown or revoked.")
	}
	now := time.Now()
	if expires := record.GetDateTime("expires"); !expires.IsZero() && !expires.Time().After(now) {
		return Principal{}, errors.New("The gateway token has expired.")
	}
	// The last use is kept to the minute, written directly: it is not an edit.
	if last := record.GetDateTime("lastUsed"); last.IsZero() || now.Sub(last.Time()) > time.Minute {
		stamp, _ := types.ParseDateTime(now)
		if _, err := c.app.DB().Update(schema.AdminTokens, dbx.Params{"lastUsed": stamp.String()}, dbx.HashExp{"id": record.Id}).Execute(); err != nil {
			c.app.Logger().Warn("Token last use not recorded", "token", record.GetString("name"), "error", err.Error())
		}
	}
	return Principal{Actor: "token:" + record.GetString("name"), Role: record.GetString("role"), Stages: record.GetStringSlice("stages")}, nil
}

// NewToken describes a token to create.
type NewToken struct {
	Name    string   `json:"name"`
	Role    string   `json:"role"`
	Stages  []string `json:"stages"`
	Expires string   `json:"expires"` // RFC 3339 or empty for never
	Note    string   `json:"note"`
}

// CreateToken stores a new token's hash and returns the token, which is not
// kept anywhere else.
func (c *Control) CreateToken(actor string, in NewToken) (string, *core.Record, error) {
	if in.Role != "releaser" {
		in.Stages = nil
	}
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", nil, err
	}
	token := tokenPrefix + hex.EncodeToString(raw)
	collection, err := c.app.FindCollectionByNameOrId(schema.AdminTokens)
	if err != nil {
		return "", nil, err
	}
	record := core.NewRecord(collection)
	record.Load(map[string]any{"name": in.Name, "role": in.Role, "stages": in.Stages, "expires": in.Expires,
		"hash": hashToken(token), "note": in.Note})
	if err := c.app.Save(record); err != nil {
		return "", nil, err
	}
	c.audit(actor, "create-token", schema.AdminTokens, record.Id, map[string]any{"name": in.Name, "role": in.Role,
		"stages": in.Stages, "expires": in.Expires})
	return token, record, nil
}

func (c *Control) createTokenRoute(e *core.RequestEvent) error {
	var in NewToken
	if err := e.BindBody(&in); err != nil {
		return e.BadRequestError("Invalid body.", err)
	}
	token, record, err := c.CreateToken(actorOf(e.Auth), in)
	if err != nil {
		return e.JSON(http.StatusUnprocessableEntity, map[string]any{"error": err.Error()})
	}
	return e.JSON(http.StatusOK, map[string]any{"token": token, "record": record.PublicExport()})
}

// bindTokens keeps token hashes out of reach of the collections API: tokens
// are created by CreateToken only, and their hash never changes.
func (c *Control) bindTokens() {
	c.app.OnRecordValidate(schema.AdminTokens).BindFunc(func(e *core.RecordEvent) error {
		if e.Record.GetString("role") == "releaser" && len(e.Record.GetStringSlice("stages")) == 0 {
			return validation.Errors{"stages": validation.NewError("validation_releaser", "a releaser needs the environments it may release to")}
		}
		return e.Next()
	})
	c.app.OnRecordCreateRequest(schema.AdminTokens).BindFunc(func(e *core.RecordRequestEvent) error {
		return e.ForbiddenError("Create tokens with POST /gateway/v1/tokens; the token is shown once.", nil)
	})
	c.app.OnRecordUpdateRequest(schema.AdminTokens).BindFunc(func(e *core.RecordRequestEvent) error {
		if e.Record.GetString("hash") != e.Record.Original().GetString("hash") {
			return e.ForbiddenError("A token's hash cannot change; create a new token instead.", nil)
		}
		return e.Next()
	})
}

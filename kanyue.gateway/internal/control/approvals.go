package control

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/types"

	"kanyue.gateway/internal/schema"
)

// With GATEWAY_RELEASE_APPROVAL=1 a release to RELEASE waits for a second
// identity. The request keeps a digest of the definitions it resolved to; the
// approval releases only if the drafts still resolve to exactly that, so what
// was reviewed is what goes live. Offline and rollback stay immediate: they
// are what an incident needs.

const approvalTTL = 24 * time.Hour

func needsApproval(enabled bool, stage string) bool { return enabled && stage == "RELEASE" }

func digestOf(changes []change) string {
	sum := sha256.New()
	for _, next := range changes {
		fmt.Fprintf(sum, "%s|%s|", next.Kind, next.ID)
		sum.Write(mustCanonical(next.definition))
		sum.Write([]byte{'\n'})
	}
	return hex.EncodeToString(sum.Sum(nil))
}

// RequestRelease records a release to wait for approval and returns it; nil
// when RELEASE already serves every target as asked.
func (c *Control) RequestRelease(actor string, req Request) (*core.Record, Result, error) {
	result := Result{Stage: req.Stage}
	changes, err := c.resolveAll(req)
	if err != nil {
		return nil, result, err
	}
	current, err := served(c.app, req.Stage)
	if err != nil {
		return nil, result, err
	}
	pre, err := served(c.app, "PRE")
	if err != nil {
		return nil, result, err
	}
	var listed, promotions []Released
	for _, next := range changes {
		previous := current[next.Target]
		if bytes.Equal(definitionOf(previous), mustCanonical(next.definition)) {
			result.Unchanged = append(result.Unchanged, next.Target)
			continue
		}
		entry := Released{Target: next.Target, Name: next.name, Diff: definitionDiff(definitionOf(previous), next.definition)}
		if previous != nil {
			entry.Previous = previous.GetInt("version")
		}
		listed = append(listed, entry)
		if next.Kind == "api" && !bytes.Equal(definitionOf(pre[next.Target]), mustCanonical(next.definition)) {
			promotions = append(promotions, Released{Target: next.Target, Name: next.name,
				Diff: definitionDiff(definitionOf(pre[next.Target]), next.definition)})
		}
	}
	if len(listed) == 0 {
		return nil, result, nil
	}
	if len(promotions) > 0 && strings.TrimSpace(req.Reason) == "" {
		return nil, result, &PromotionError{Diffs: promotions}
	}
	collection, err := c.app.FindCollectionByNameOrId(schema.Approvals)
	if err != nil {
		return nil, result, err
	}
	record := core.NewRecord(collection)
	record.Load(map[string]any{"stage": req.Stage, "request": req, "changes": listed, "digest": digestOf(changes),
		"requester": actor, "status": "pending"})
	if err := c.app.Save(record); err != nil {
		return nil, result, err
	}
	c.audit(actor, "request-release", schema.Approvals, record.Id, map[string]any{"stage": req.Stage, "targets": req.Targets,
		"note": req.Note, "reason": req.Reason, "force": req.Force})
	return record, result, nil
}

// decide moves a pending approval to status; only one decision wins.
func (c *Control) decide(id, status, approver string) (bool, error) {
	stamp, _ := types.ParseDateTime(time.Now())
	res, err := c.app.DB().Update(schema.Approvals, dbx.Params{"status": status, "approver": approver, "decided": stamp.String()},
		dbx.And(dbx.HashExp{"id": id}, dbx.HashExp{"status": "pending"})).Execute()
	if err != nil {
		return false, err
	}
	n, err := res.RowsAffected()
	return n == 1, err
}

func (c *Control) pendingApproval(id string) (*core.Record, Request, error) {
	var req Request
	record, err := c.app.FindRecordById(schema.Approvals, id)
	if err != nil {
		return nil, req, errors.New("no such approval request")
	}
	if record.GetString("status") != "pending" {
		return nil, req, fmt.Errorf("the request is already %s", record.GetString("status"))
	}
	if time.Since(record.GetDateTime("created").Time()) > approvalTTL {
		c.decide(id, "expired", "")
		return nil, req, errors.New("the request expired after 24 hours; request the release again")
	}
	err = record.UnmarshalJSONField("request", &req)
	return record, req, err
}

// Approve releases a pending request as its approver, a different identity
// from the requester, if the drafts still resolve to what was requested.
func (c *Control) Approve(approver, id string) (Result, error) {
	record, req, err := c.pendingApproval(id)
	if err != nil {
		return Result{}, err
	}
	requester := record.GetString("requester")
	if requester == approver {
		return Result{}, errors.New("a second identity must approve the release")
	}
	changes, err := c.resolveAll(req)
	if err == nil && digestOf(changes) != record.GetString("digest") {
		err = errors.New("the drafts changed since the request")
	}
	if err != nil {
		c.decide(id, "stale", approver)
		return Result{}, fmt.Errorf("%w; request the release again", err)
	}
	if won, err := c.decide(id, "approved", approver); err != nil || !won {
		return Result{}, firstErr(err, errors.New("the request was decided meanwhile"))
	}
	result, err := c.apply(requester+", approved by "+approver, "release", req, changes)
	if err != nil {
		// Back to pending: the approver may fix what stopped it (an unhealthy instance) and approve again.
		c.app.DB().Update(schema.Approvals, dbx.Params{"status": "pending", "approver": "", "decided": "", "error": err.Error()},
			dbx.HashExp{"id": id}).Execute()
		return result, err
	}
	c.app.DB().Update(schema.Approvals, dbx.Params{"stageVersion": result.Version, "error": ""}, dbx.HashExp{"id": id}).Execute()
	c.audit(approver, "approve-release", schema.Approvals, id, map[string]any{"stage": req.Stage, "requester": requester,
		"stageVersion": result.Version})
	return result, nil
}

// Reject closes a pending request; the requester may withdraw it the same way.
func (c *Control) Reject(actor, id string) error {
	if _, _, err := c.pendingApproval(id); err != nil {
		return err
	}
	if won, err := c.decide(id, "rejected", actor); err != nil || !won {
		return firstErr(err, errors.New("the request was decided meanwhile"))
	}
	c.audit(actor, "reject-release", schema.Approvals, id, nil)
	return nil
}

func firstErr(errs ...error) error {
	for _, err := range errs {
		if err != nil {
			return err
		}
	}
	return nil
}

func (c *Control) approvalsRoute(e *core.RequestEvent) error {
	records, err := c.app.FindRecordsByFilter(schema.Approvals, "id != ''", "-created", 100, 0)
	if err != nil {
		return err
	}
	out := make([]map[string]any, len(records))
	for i, record := range records {
		out[i] = record.PublicExport()
	}
	return e.JSON(http.StatusOK, out)
}

func (c *Control) decideRoute(approve bool) func(e *core.RequestEvent) error {
	return func(e *core.RequestEvent) error {
		id := e.Request.PathValue("id")
		record, err := c.app.FindRecordById(schema.Approvals, id)
		if err != nil {
			return e.NotFoundError("No such approval request.", nil)
		}
		if err := c.mayRelease(e, record.GetString("stage")); err != nil {
			return err
		}
		actor := principalOf(e).Actor
		if !approve {
			if err := c.Reject(actor, id); err != nil {
				return e.JSON(http.StatusUnprocessableEntity, map[string]any{"error": err.Error()})
			}
			return e.NoContent(http.StatusNoContent)
		}
		return releaseResult(e, func() (Result, error) { return c.Approve(actor, id) })
	}
}

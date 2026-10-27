// Package audit writes ops_audit_logs like Hono's AuditService; a failed audit
// write is logged and never fails the business operation.
package audit

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
)

const collection = "ops_audit_logs"

type Actor struct {
	ID   string
	Role string
}

type Entry struct {
	Actor        *Actor
	Action       string
	ResourceType string
	ResourceID   string
	Outcome      string
	Metadata     map[string]any
}

func Record(app core.App, entry Entry) {
	target, err := app.FindCollectionByNameOrId(collection)
	if err != nil {
		log.Printf("audit %s: %v", entry.Action, err)
		return
	}
	actor := entry.Actor
	if actor == nil {
		actor = &Actor{Role: "anonymous"}
	}
	if actor.Role == "" {
		actor.Role = "anonymous"
	}
	outcome := entry.Outcome
	if outcome == "" {
		outcome = "allowed"
	}
	metadata := entry.Metadata
	if metadata == nil {
		metadata = map[string]any{}
	}
	record := core.NewRecord(target)
	record.Set("actorId", actor.ID)
	record.Set("actorRole", actor.Role)
	record.Set("action", entry.Action)
	record.Set("resourceType", entry.ResourceType)
	record.Set("resourceId", entry.ResourceID)
	record.Set("outcome", outcome)
	record.Set("metadata", metadata)
	if err := app.Save(record); err != nil {
		log.Printf("audit %s: %v", entry.Action, err)
	}
}

func Denied(app core.App, actor *Actor, action, resourceType, resourceID string, metadata map[string]any) {
	Record(app, Entry{Actor: actor, Action: action, ResourceType: resourceType, ResourceID: resourceID, Outcome: "denied", Metadata: metadata})
}

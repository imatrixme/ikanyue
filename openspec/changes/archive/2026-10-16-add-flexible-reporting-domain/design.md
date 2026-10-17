## Context

Kanyue currently has a student-centered assessment workflow: teachers create assessment records, submission creates immutable report snapshots, and the mini program can render student-owned report history or public share links. That model works for a single student assessment, but it does not represent the looser operational reality: a trial lesson, course package, activity, or custom project can have uncertain dates, uncertain session count, changing teacher/student participation, absences, and several report kinds generated for different recipients.

The new model must coexist with the existing assessment APIs so the current mini program and admin flows keep working during migration. Flutter is out of scope, and the parent repo must stay dependency-neutral.

## Goals / Non-Goals

**Goals:**
- Represent loose learning work as programs with optional planned structure and sessions with actual participation.
- Support many-to-many teachers and students at both program and session level.
- Issue multiple report instances from one report event, including student reports, teacher feedback reports, and admin/internal summaries.
- Keep report visibility recipient-based so each student or teacher can see only published reports addressed to them.
- Reuse the reporting projection layer so public/student/teacher responses expose only whitelisted fields.
- Preserve legacy assessment report routes while enabling new generic report records.
- Add focused unit tests with coverage gates at or above 90% for affected subprojects.

**Non-Goals:**
- No Flutter implementation.
- No new root JavaScript workspace or root package manager files.
- No replacement of PocketBase with another database.
- No real-time collaboration or scheduling optimization engine.
- No automatic AI report generation; report JSON may be authored or assembled by services, but generation policy remains explicit.

## Decisions

1. Use `learning_programs` as a loose container and `learning_sessions` as actual occurrences.
   - Rationale: planned course packages and activities often change after registration, while actual attendance/teachers are known only per session.
   - Alternative considered: model everything as activities. This would overload existing activity publishing with teaching operations and make attendance/report scoping brittle.

2. Store participation as join collections instead of arrays.
   - Rationale: `program_students`, `program_teachers`, `session_students`, and `session_teachers` allow per-person role, status, attendance, and future metadata without rewriting parent records.
   - Alternative considered: store participant IDs in JSON. This is faster to prototype but prevents reliable filtering, authorization, and migration.

3. Add generic report primitives alongside legacy assessment tables.
   - Rationale: `report_templates`, `report_events`, `evaluation_inputs`, and `report_instances` can represent multiple report kinds and recipients, while existing `assessment_records` and `assessment_report_snapshots` continue to satisfy current routes.
   - Alternative considered: mutate assessment tables into generic report tables. That would be a risky breaking migration before the current lightweight loop is online.

4. Use explicit `scopeType/scopeId`, `subjectType/subjectId`, and `recipientType/recipientId` fields.
   - Rationale: scope answers “why/where this report was launched,” subject answers “who/what the report describes,” and recipient answers “who may read it.” This supports one student receiving several reports from the same activity and one teacher receiving several feedback reports.
   - Alternative considered: infer everything from relations. That makes lists and authorization expensive and ambiguous when reports are custom or cross-session.

5. Keep public report payloads projection-first.
   - Rationale: prior verification showed raw PocketBase fields can leak through expanded student/teacher objects. All report readers must use whitelist projections instead of sanitizing broad raw objects after the fact.
   - Alternative considered: extend deny-list sanitization. Deny-lists are easy to miss when PocketBase records gain new fields.

6. Stage migration with dual-read before cutover.
   - Rationale: current reports already exist as assessment snapshots. Student report lists can merge legacy snapshots and generic report instances, while admin can start creating generic report events for new workflows.
   - Alternative considered: one-time full migration before release. This raises rollback risk and delays the student report registration milestone.

## Risks / Trade-offs

- [Risk] Generic report records become too abstract for admin users → Mitigation: admin UI groups workflows by program/session/event and uses report type labels, not database terminology.
- [Risk] Dual-read can show duplicate legacy and generic reports → Mitigation: legacy assessment-generated generic instances store `sourceType/sourceId` and list logic de-duplicates by source when both exist.
- [Risk] Authorization gets more complex with program and session assignments → Mitigation: centralize teacher access checks around program/session/report-event assignment and cover denial paths in Hono tests.
- [Risk] JSON report content can drift between report kinds → Mitigation: templates declare report type and schema metadata; services validate required envelope fields before publication.
- [Risk] PocketBase schema migration fails on production data → Mitigation: deploy with backup, schema check/apply, local Docker validation, side-by-side Hono verification, and rollback via Docker image plus PB backup restore.

## Migration Plan

1. Add new PocketBase collections and indexes without removing legacy assessment collections.
2. Deploy Hono/admin Docker images in a bypass/side-channel environment and run schema check/apply against a copied PocketBase dataset.
3. Verify legacy student report list/detail and new generic report event/instance APIs against copied data.
4. Enable admin creation of generic programs/sessions/report events while keeping legacy assessment routes active.
5. After confidence, backfill generic `report_instances` for existing assessment snapshots using `sourceType="assessment_snapshot"` and `sourceId=<snapshot id>`.
6. Rollback by routing traffic back to the previous Docker image; if data rollback is required, restore the pre-deploy PocketBase backup and MinIO object state.

## Open Questions

- The first production report templates need business-owned labels and scoring envelopes for midterm, final, per-session, teacher feedback, and activity summary reports.
- Whether parent-facing non-student recipients are needed immediately is not confirmed; the model can support them later via a new `recipientType` if required.

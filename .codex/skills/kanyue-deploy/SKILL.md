---
name: kanyue-deploy
description: Safe deployment and rollback workflow for the Kanyue Docker stack. Use when preparing, validating, deploying, migrating PocketBase schema, backing up production data, switching OpenResty traffic, performing旁路验证, or rolling back admin/hono/pocketbase Docker releases.
---

# Kanyue Deploy

Use this skill for Kanyue production or bypass deployments involving `ikanyue.admin`, `ikanyue.mapi.hono`, PocketBase, Docker Compose, 1Panel, OpenResty, or PB schema migration.

## Core Rules

- Never overwrite production `pb_data` with local data.
- Always create a timestamped PB data backup before schema migration or service switch.
- Treat schema migration and data migration separately. Use `npm run ops:schema:apply` for PB collection schema; do not copy local test records to production.
- Prefer旁路验证 first: deploy new Docker stack on alternate ports/domains, verify, then switch OpenResty.
- Do not cut traffic until old and new stack state, backup path, image/tag/commit, and rollback target are recorded.
- Use `rtk` for shell commands in this repo environment.
- Keep Flutter out of this deployment flow unless the user explicitly includes it.

## Workflow

1. **Inspect Current State**
   - Run `git status --short` in the parent repo and submodules.
   - Identify exact commits for parent, `ikanyue.admin`, and `ikanyue.mapi.hono`.
   - Inspect current compose project, container status, ports, and OpenResty routes.

2. **Prepare Backup**
   - Use `scripts/backup_pb_data.sh` or equivalent `tar` command.
   - Store backup outside the active `pb_data` directory.
   - Verify the archive exists and is non-empty.
   - Record restore command before proceeding.

3. **Deploy Bypass Stack**
   - Start the new compose stack with a distinct project name and ports.
   - Do not modify live OpenResty yet.
   - Confirm Hono can authenticate to PB.

4. **Apply PB Schema**
   - Run from `ikanyue.mapi.hono` against the target PB:
     `PB_URL=... PB_EMAIL=... PB_PASSWORD=... npm run ops:schema:apply`
   - This must be idempotent.
   - Re-check required collections after apply.

5. **Verify Bypass**
   - Use `scripts/verify_stack.sh` with the bypass Hono base URL.
   - Required checks: activity list, public operation slots, activity signup list with a student token when available, report list/detail when test data exists.
   - Confirm asset URLs use `https://kyoss.abcmem.com/ikanyue-mp/...`.

6. **Switch Traffic**
   - Only after backup and bypass verification pass.
   - Update OpenResty upstream/proxy target.
   - Reload OpenResty, do not restart blindly unless required.
   - Verify public domains: `mapi.ikanyue.com`, `xapi.ikanyue.com`, `data.ikanyue.com`, and asset URLs.

7. **Rollback If Needed**
   - Prefer Docker/OpenResty rollback first.
   - Restore PB data only if schema/data mutation caused damage and the user confirms data loss tradeoff.
   - Use `scripts/rollback_compose.sh` as a checklist helper.

## References

- Read `references/deployment-runbook.md` for concrete commands, backup/restore patterns, schema migration, verification endpoints, and rollback order.
- Use scripts from `scripts/` only after reading their `--help` output.

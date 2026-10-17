## Deployment Handoff Notes

This change adds PocketBase collections and writable report workflows. Deployment must use a bypass stack first and must keep schema migration separate from data migration.

## Pre-Deploy Recording

- Record parent, admin, and Hono commits before building images.
- Record current Docker Compose project names, image tags, container ports, and OpenResty upstream targets.
- Record the live PocketBase data path and the exact backup archive path before any schema apply.

## PocketBase Backup

- Create a timestamped `pb_data` backup outside the active PocketBase data directory before running schema migration.
- Verify the backup archive exists and is non-empty.
- Write down the restore command before continuing.
- Do not overwrite production `pb_data` with local data. A local copied dataset may be used only for bypass verification.

## Schema Migration

- Apply schema only after backup:
  `PB_URL=<target PB> PB_EMAIL=<admin email> PB_PASSWORD=<admin password> npm run ops:schema:apply`
- The schema apply is expected to be idempotent and must add the flexible reporting collections without removing legacy assessment collections.
- After apply, run `npm run ops:schema:check` and confirm the new report/program/session collections exist.
- Existing assessment snapshots remain valid. Backfill into `report_instances` should use `sourceType="assessment_snapshot"` and `sourceId=<snapshot id>` so dual-read de-duplication can rollback safely.

## Bypass Verification

- Start the new Docker stack with alternate project name, ports, or bypass domain.
- Do not switch OpenResty traffic during bypass verification.
- Verify Hono can reach PocketBase and public APIs still return success:
  - activity list
  - operation slots
  - student report list/detail when a test token is available
  - report event and report instance management APIs with admin credentials
- Verify returned asset URLs use the public object domain shape, for example `https://kyoss.abcmem.com/ikanyue-mp/...`, and do not rely on business-code S3 credentials.
- Confirm no `Missing collection context`, no `每页数量不能超过100`, and no unexpected WeChat APPID/SECRET errors in the verified flows.

## Traffic Switch

- Switch traffic only after backup, schema check, bypass verification, image tags, and rollback target are recorded.
- Update OpenResty upstreams for `mapi.ikanyue.com` or `xapi.ikanyue.com` to the verified Hono container.
- Validate OpenResty config before reload, then reload OpenResty.
- Re-check `mapi.ikanyue.com`, `xapi.ikanyue.com`, `data.ikanyue.com`, and public asset URLs after reload.

## Rollback

- Prefer traffic rollback first: point OpenResty back to the previous Hono/admin stack and reload.
- If needed, recreate old services from recorded Docker image tags and commits.
- Restore PocketBase data only when schema/data mutation caused production damage and the user accepts losing writes after the backup.
- If restoring PB data, stop writers first, move the broken `pb_data` aside, extract the backup into the active data path, then restart PocketBase and Hono.


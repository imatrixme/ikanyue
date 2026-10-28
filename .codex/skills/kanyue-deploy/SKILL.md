---
name: kanyue-deploy
description: Safe deployment and rollback workflow for the Kanyue Docker stack. Use when preparing, validating, deploying, migrating PocketBase schema, backing up production data, switching OpenResty traffic, performing旁路验证, or rolling back kanyue.server (API + embedded PocketBase + admin SPA), kanyue.pay or kanyue.gateway (API gateway) releases.
---

# Kanyue Deploy

Use this skill for Kanyue production or bypass deployments involving `kanyue.server` (single binary: business API, embedded PocketBase, embedded `ikanyue.admin` SPA), `kanyue.pay` (single binary: payment gateway with its own embedded PocketBase), Docker Compose, 1Panel, OpenResty, or schema migration.

## Core Rules

- Never overwrite production `pb_data` with local data.
- Always create a timestamped data backup before `migrate up` or a service switch.
- Schema changes are explicit: `kanyue-server migrate up` / `kanyue-pay migrate up`. `serve` refuses to start while a migration is pending; it never migrates by itself. Do not copy local test records (`seed local`) to production — it refuses `NODE_ENV=production`.
- Prefer旁路验证 first: deploy the new image on alternate ports/domains, verify, then switch OpenResty.
- Do not cut traffic until old and new stack state, backup path, image/tag/commit, and rollback target are recorded.
- The PocketBase dashboards (`/_/`) only answer direct private-network calls; use an SSH tunnel, never expose them through OpenResty.
- Use `rtk` for shell commands in this repo environment.
- Keep Flutter out of this deployment flow unless the user explicitly includes it.

## Workflow

1. **Inspect Current State**
   - Run `git status --short`; record the parent commit (one repository, `master`).
   - Inspect current compose project, container status, ports, and OpenResty routes.

2. **Prepare Backup**
   - Use `scripts/backup_pb_data.sh` or equivalent `tar` command; payment data uses `kanyue-pay maintenance backup payment`.
   - Store backup outside the active `pb_data` directory.
   - Verify the archive exists and is non-empty.
   - Record restore command before proceeding.

3. **Deploy Bypass Stack**
   - Build the server image (compose passes `ikanyue.admin` as the `console` build context).
   - Start it with a distinct project name and ports (`.env.bypass.example`) on a copy of the data.
   - Do not modify live OpenResty yet.

4. **Apply Schema**
   - `docker compose run --rm --entrypoint kanyue-server server migrate up --dir=/pb_data`
   - Idempotent: a second run reports `No pending migrations.`

5. **Verify Bypass**
   - `scripts/verify_stack.sh --server <bypass base URL>` checks the admin page, activity list and public course catalog; pass `--student-token` for an authenticated check.
   - Confirm asset URLs use `https://kyoss.abcmem.com/ikanyue-mp/...`.

6. **Switch Traffic**
   - Only after backup and bypass verification pass.
   - Update OpenResty upstream/proxy target (admin domain → `ADMIN_PORT`, API domain → `API_PORT`, data domain → `POCKETBASE_PORT`; all reach the same server).
   - Reload OpenResty, do not restart blindly unless required.
   - Verify public domains: `mapi.ikanyue.com`, `xapi.ikanyue.com`, `data.ikanyue.com`, and asset URLs.

7. **Rollback If Needed**
   - Prefer Docker/OpenResty rollback first.
   - Restore data only if schema/data mutation caused damage and the user confirms data loss tradeoff.
   - Use `scripts/rollback_compose.sh` as a checklist helper.

## Payment Gateway

`compose.pay.release.yaml` runs `kanyue-pay` alone with its data directory and read-only credentials. Live activation also needs `kanyue-pay maintenance preflight` (live credentials, immutable `PAY_IMAGE` digest, clean worktree, recent verified backup reports, explicit acceptance attestations). See `kanyue.pay/README.md`.

## API Gateway

`kanyue.gateway` replaces the Aliyun API gateway. In `compose.yaml` it is the `gateway` service under the `gateway` profile.

Ports:
- Data plane `GATEWAY_PORT`: OpenResty proxies the API domains here at cutover.
- Admin plane and console `127.0.0.1:1461`: SSH tunnel only, never an OpenResty site.

Bring-up order:
1. Back up `gateway_data` like any PocketBase data.
2. Start the gateway with `GATEWAY_REGISTRATION_TOKEN` and a 32-character `GATEWAY_ENCRYPTION_KEY`.
3. Enroll the console superuser's authenticator: `kanyue-gateway totp enroll <email> --dir=/pb_data --encryptionEnv=GATEWAY_ENCRYPTION_KEY` (inside the gateway container, which already has the key).
4. Set `GATEWAY_URL=http://gateway:1461` plus the token on `server` (and pay) so they register.
5. Run `kanyue-gateway exposure apply mapi` (the mini program calls on `mapi.ikanyue.com`, which is all the Aliyun gateway exposes), review the route in the console, and publish.

Shadow-run on a bypass domain first. Then switch `mapi.ikanyue.com` in OpenResty; the Aliyun gateway stays as the rollback target until the observation window closes. Rolling back a bad config is a console rollback (it creates a new version), not a data restore. See `kanyue.gateway/README.md` (OpenResty sample, VictoriaLogs, backups).

## References

- Read `references/deployment-runbook.md` for concrete commands, backup/restore patterns, schema migration, verification endpoints, and rollback order.
- Use scripts from `scripts/` only after reading their `--help` output.

---
name: kanyue-website-deploy
description: Deploy, update, migrate, verify, and roll back the ikanyue.website Nuxt official site on Linux VPS hosts managed by 1Panel and OpenResty. Use when publishing ikanyue.com, moving the website to another server, creating the standalone Node/systemd runtime, correcting 1Panel static-versus-proxy drift, switching releases through a current symlink, validating the live ICP/contact/activity experience, or preparing a production rollback. Keep Hono, PocketBase, Admin, and mini-program services outside this workflow unless the user explicitly includes them.
---

# Kanyue Website Deploy

Deploy the Nuxt website as a standalone Node service on loopback, then expose it through a 1Panel-managed OpenResty reverse proxy. Preserve a release-based rollback path and verify content through the real public domain before closing the task.

## Non-Negotiable Rules

- Use `rtk` for shell commands in this repository environment.
- Inspect the repository, remote host, active release, service, OpenResty topology, and 1Panel paths before writing.
- Build and test `ikanyue.website`; do not deploy only `.output/public`. The site needs Nitro server routes such as `/api/activities`.
- Keep the Node listener on `127.0.0.1`; expose only OpenResty publicly.
- Preserve the previous release until the new release passes public verification.
- Use a timestamped backup before changing OpenResty, 1Panel metadata, an existing site directory, or the 1Panel database.
- Prefer the 1Panel UI/API for website metadata. Use direct SQLite updates only as the guarded fallback in `references/onepanel-metadata.md`.
- Do not modify Hono to compensate for website deployment problems. Verify the website adapter and `NUXT_PUBLIC_API_BASE` first.
- Never overwrite PocketBase data, change Admin, or restart unrelated containers in this workflow.
- Do not declare success while an SSH session, bypass process, or deployment command is still running.

## Select the Workflow

1. **In-place website update**: preserve current OpenResty and 1Panel configuration; build, upload, bypass-test, switch `current`, restart systemd, and verify.
2. **New-server migration**: provision Node/systemd, create the release layout, configure DNS/TLS and a 1Panel reverse-proxy site, then perform the same bypass and switch gates.
3. **Static-to-proxy correction**: back up the current site, OpenResty configuration, and 1Panel database; convert the site to the native proxy layout and ensure 1Panel records `type=proxy`.
4. **Rollback**: point `current` at the previous release first. Restore OpenResty or 1Panel state only when those layers changed.

Read `references/deployment-runbook.md` for the complete sequence. Read `references/onepanel-metadata.md` before changing 1Panel records. Read `references/troubleshooting.md` when a gate fails. Read `references/production-profile.md` for the current production snapshot, but verify every drift-prone value live.

## Required Gates

### 1. Establish the Deployment Record

Record:

- parent and `ikanyue.website` commits
- target host and domains
- current release and rollback release
- service name, Node binary, app root, live port, bypass port
- 1Panel root, OpenResty container/network mode, site config paths
- backup path and restore commands

### 2. Validate Locally

Run from `ikanyue.website`:

```bash
rtk pnpm test
rtk pnpm run lint
rtk env \
  NUXT_PUBLIC_API_BASE=https://xapi.ikanyue.com \
  NUXT_PUBLIC_SITE_URL=https://ikanyue.com \
  pnpm run build
rtk env NUXT_IGNORE_LOCK=1 pnpm test:e2e
```

Package only after `.output/server/index.mjs` exists. Use `scripts/package-release.sh` to reject localhost or debug fixture leakage, then create a checksum-addressed archive without macOS extended attributes.

### 3. Back Up Before Mutable Infrastructure Changes

For release-only updates, record the current symlink and retain that release. For migrations or proxy/metadata changes, back up:

- the active OpenResty domain config
- the complete website directory, excluding logs when appropriate
- the 1Panel database through a consistent SQLite backup
- existing systemd units or environment files
- exact rollback commands

### 4. Verify on a Bypass Port

Extract to a new immutable release directory and run it temporarily on `127.0.0.1:13001`. Verify homepage, contact page, QR image, ICP filing, real activity data, and service logs. Do not switch `current` when any check fails.

### 5. Switch Atomically

Create `current.next`, point it at the new release, then rename it over `current`. Restart `ikanyue-website.service`, poll the loopback endpoint until ready, and keep the previous release path in the deployment record.

### 6. Verify Public Traffic

Use `scripts/verify-website.sh` with the public domain and optional direct VPS IP. Verify:

- HTTPS `200`
- HTTP-to-HTTPS `301`
- `www` host when configured
- homepage and ICP filing
- contact phone, `tel:` link, phone icon, QR asset, and current QR caption
- activities page backed by the real Hono response
- OpenResty syntax, systemd state, and recent logs

### 7. Close Cleanly

Remove uploaded archives and bypass files, stop temporary processes, retain the previous release and backups, confirm both repositories are clean, and report residual risk.

## Resources

- `references/deployment-runbook.md`: complete update and migration procedure
- `references/production-profile.md`: current production topology and content probes
- `references/onepanel-metadata.md`: native proxy layout and guarded SQLite fallback
- `references/troubleshooting.md`: known failure modes and diagnosis order
- `scripts/package-release.sh`: reproducible `.output` archive and SHA-256
- `scripts/verify-website.sh`: local, bypass, or public smoke verification
- `scripts/backup-1panel-db.mjs`: consistent SQLite backup through `VACUUM INTO`
- `scripts/onepanel-site-metadata.mjs`: dry-run inspection and guarded proxy metadata update
- `assets/ikanyue-website.service.template`: hardened new-server systemd template
- `assets/openresty-site.conf.template`: 1Panel-compatible domain configuration
- `assets/openresty-proxy-root.conf.template`: reverse-proxy location configuration

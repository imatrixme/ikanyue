# Website Deployment Runbook

## Contents

1. Decide update or migration
2. Inspect local and remote state
3. Build and package
4. Prepare the target host
5. Back up mutable state
6. Upload and extract a release
7. Run bypass verification
8. Switch the active release
9. Configure 1Panel and OpenResty
10. Cut over DNS on a migration
11. Verify public traffic
12. Roll back
13. Close and hand over

## 1. Decide Update or Migration

Use an in-place update when systemd, the release root, the Node version, and the 1Panel proxy already exist. Do not rewrite OpenResty or 1Panel metadata for a content-only website release.

Use a migration when any of these are absent or changing:

- server or IP
- Node/systemd runtime
- release directory
- DNS or TLS
- 1Panel website record
- OpenResty network topology

Use the static-to-proxy path when the domain serves Nuxt but 1Panel still reports a static website.

## 2. Inspect Local and Remote State

Local:

```bash
rtk git status --short
rtk git -C ikanyue.website status --short
rtk git rev-parse HEAD
rtk git -C ikanyue.website rev-parse HEAD
rtk stat ikanyue.website/.output/server/index.mjs
```

Remote:

```bash
systemctl is-active ikanyue-website.service
systemctl is-enabled ikanyue-website.service
readlink -f /opt/ikanyue.website/current
ss -lntp | grep ':13000'
docker ps --format '{{.Names}} {{.Image}}'
docker inspect -f '{{.HostConfig.NetworkMode}}' <openresty-container>
```

Discover 1Panel paths instead of assuming them:

```bash
systemctl cat 1panel.service
find /opt /root -maxdepth 5 -type f -name '1Panel.db' 2>/dev/null
find /opt /root -maxdepth 7 -type d -path '*openresty*conf.d' 2>/dev/null
```

Record the active release before any switch.

## 3. Build and Package

From `ikanyue.website`:

```bash
rtk pnpm install --frozen-lockfile
rtk pnpm test
rtk pnpm run lint
rtk env \
  NUXT_PUBLIC_API_BASE=https://xapi.ikanyue.com \
  NUXT_PUBLIC_SITE_URL=https://ikanyue.com \
  pnpm run build
rtk env NUXT_IGNORE_LOCK=1 pnpm test:e2e
```

Never run the production build with the local default URLs. Prerendered routes, `robots.txt`, `sitemap.xml`, payloads, and structured data can otherwise capture localhost values or local fixture content.

Package from the parent repository:

```bash
rtk .codex/skills/kanyue-website-deploy/scripts/package-release.sh ikanyue.website /tmp
```

Upload the archive with `scp`, then compare the remote SHA-256 with the script output before extracting.

## 4. Prepare a New Target Host

Recommended new-server defaults:

```text
SERVICE_USER=ikanyue-website
APP_ROOT=/opt/ikanyue.website
RELEASE_ROOT=/opt/ikanyue.website/releases
LIVE_PORT=13000
BYPASS_PORT=13001
SERVICE_NAME=ikanyue-website.service
```

Create a non-login user and directories:

```bash
useradd --system --home /opt/ikanyue.website --shell /usr/sbin/nologin ikanyue-website
install -d -o ikanyue-website -g ikanyue-website -m 0755 /opt/ikanyue.website/releases
```

Install a supported Node 22 runtime. Record the absolute binary path; systemd does not inherit an interactive NVM shell.

Allow inbound TCP 80/443 and the approved SSH port. Keep 13000 and 13001 bound to loopback and absent from the public firewall.

Render `assets/ikanyue-website.service.template`, install it under `/etc/systemd/system`, then run:

```bash
systemd-analyze verify /etc/systemd/system/ikanyue-website.service
systemctl daemon-reload
systemctl enable ikanyue-website.service
```

Do not start the service until a valid `current` symlink exists.

## 5. Back Up Mutable State

For an existing site migration, create a UTC timestamp directory outside the active site:

```bash
BACKUP_ROOT=/root/services/backups/ikanyue.website
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
BACKUP="$BACKUP_ROOT/$STAMP-migration"
mkdir -p "$BACKUP"
```

Back up:

```bash
cp -a <domain-conf> "$BACKUP/ikanyue.com.conf"
tar --exclude='ikanyue.com/log' -czf "$BACKUP/ikanyue.com-site.tar.gz" -C <sites-root> ikanyue.com
cp -a /etc/systemd/system/ikanyue-website.service "$BACKUP/" 2>/dev/null || true
```

Upload the SQLite helpers when the remote host does not contain this repository:

```bash
rtk scp \
  .codex/skills/kanyue-website-deploy/scripts/backup-1panel-db.mjs \
  .codex/skills/kanyue-website-deploy/scripts/onepanel-site-metadata.mjs \
  root@<host>:/tmp/
```

Back up 1Panel consistently on the remote host:

```bash
node --no-warnings --experimental-sqlite \
  /tmp/backup-1panel-db.mjs \
  <1Panel.db> "$BACKUP/1Panel.db"
```

Write restore commands before changing infrastructure. Verify the archive and database integrity.

## 6. Upload and Extract a Release

After checksum verification:

```bash
RELEASE="$RELEASE_ROOT/<UTC timestamp>-<commit prefix>"
install -d -o "$SERVICE_USER" -g "$SERVICE_USER" -m 0755 "$RELEASE"
tar -xzf /tmp/<archive>.tar.gz -C "$RELEASE"
test -f "$RELEASE/.output/server/index.mjs"
chown -R "$SERVICE_USER:$SERVICE_USER" "$RELEASE"
```

Do not extract over an existing release. Releases are immutable.

## 7. Run Bypass Verification

Start the release on the bypass port without changing `current`:

```bash
env \
  NODE_ENV=production \
  NITRO_HOST=127.0.0.1 \
  NITRO_PORT=13001 \
  NUXT_PUBLIC_API_BASE=https://xapi.ikanyue.com \
  NUXT_PUBLIC_SITE_URL=https://ikanyue.com \
  <node-binary> "$RELEASE/.output/server/index.mjs"
```

Run it in a controlled background process, record the PID, and guarantee cleanup with a shell trap. Poll for readiness instead of assuming the first curl will succeed.

```bash
rtk EXPECT_ACTIVITY_TEXT='通俗唱法高音问题与方法' \
  .codex/skills/kanyue-website-deploy/scripts/verify-website.sh \
  http://127.0.0.1:13001
```

Inspect the bypass log. Stop the bypass process before switching.

## 8. Switch the Active Release

Record the rollback release:

```bash
PREVIOUS=$(readlink -f "$APP_ROOT/current")
```

Switch atomically:

```bash
ln -sfn "$RELEASE" "$APP_ROOT/current.next"
mv -Tf "$APP_ROOT/current.next" "$APP_ROOT/current"
systemctl restart ikanyue-website.service
```

Poll `http://127.0.0.1:13000/` for up to 10 seconds. If readiness or content verification fails, restore `current` to `$PREVIOUS` and restart immediately.

## 9. Configure 1Panel and OpenResty

For a new server, create a reverse-proxy website in 1Panel:

- domains: `ikanyue.com`, `www.ikanyue.com`
- upstream: `http://127.0.0.1:13000`
- HTTPS: enabled
- HTTP-to-HTTPS: enabled
- certificate: managed by 1Panel/ACME

Prefer the native layout:

```text
conf/conf.d/ikanyue.com.conf
www/sites/ikanyue.com/proxy/root.conf
www/sites/ikanyue.com/ssl/
```

Render the templates under `assets/`. Test before reload:

```bash
docker exec <openresty-container> openresty -t
docker exec <openresty-container> openresty -s reload
```

When OpenResty is bridged rather than host-networked, `127.0.0.1` points to the container. Select a reachable host gateway and update the upstream accordingly.

For metadata drift, follow `onepanel-metadata.md`.

## 10. Cut Over DNS on a Migration

Prepare the cutover before changing records:

1. Lower the `ikanyue.com` and `www.ikanyue.com` DNS TTL at least one previous TTL window in advance when possible.
2. Confirm the new server can reach `xapi.ikanyue.com` and MinIO assets without changing those services.
3. Obtain a certificate covering both hosts. Prefer 1Panel DNS-01 when the new IP is not live yet.
4. Verify the new server directly with `curl --resolve` before changing DNS.
5. Check for stale AAAA records; do not leave IPv6 pointing at the old server.
6. Update A/AAAA records, then verify authoritative and public resolver answers.
7. Keep the old server and its certificate running until the prior TTL has expired and new-host traffic is stable.

Do not migrate `xapi.ikanyue.com`, PocketBase, or MinIO as part of a website-only move.

## 11. Verify Public Traffic

Run normal DNS verification and direct-IP verification when local DNS is intercepted:

```bash
rtk EXPECT_ACTIVITY_TEXT='通俗唱法高音问题与方法' \
  .codex/skills/kanyue-website-deploy/scripts/verify-website.sh \
  https://ikanyue.com 139.196.252.18
```

Also verify:

```bash
curl -sS -o /dev/null -w '%{http_code} %{redirect_url}\n' http://ikanyue.com/
curl -fsS -o /dev/null -w '%{http_code}\n' https://www.ikanyue.com/
systemctl status ikanyue-website.service --no-pager
journalctl -u ikanyue-website.service --since '<switch time>' --no-pager
docker exec <openresty-container> openresty -t
```

For a new server, also verify `systemctl is-enabled ikanyue-website.service`. Test reboot persistence only during an approved maintenance window.

## 12. Roll Back

Release-only rollback:

```bash
ln -sfn "$PREVIOUS" "$APP_ROOT/current.next"
mv -Tf "$APP_ROOT/current.next" "$APP_ROOT/current"
systemctl restart ikanyue-website.service
```

Proxy rollback:

1. Restore the backed-up domain config and proxy directory.
2. Test OpenResty syntax.
3. Reload OpenResty.
4. Verify the old site before considering database restoration.

1Panel metadata rollback:

1. Stop `1panel.service`.
2. Restore the backed-up `1Panel.db` with original ownership.
3. Start `1panel.service`.
4. Verify the website record and panel logs.

Restore the 1Panel database only when metadata mutation must be reversed. Do not restore it for an ordinary Nuxt release rollback.

DNS rollback during migration:

1. Restore the old A/AAAA records while the old server is still healthy.
2. Keep both servers online through the rollback TTL window.
3. Re-verify HTTPS and activity data against the old IP.

## 13. Close and Hand Over

- Remove remote archives and bypass files.
- Stop temporary SSH agents and processes.
- Retain active and previous releases.
- Retain infrastructure backups according to the operator policy.
- Confirm Git worktrees are clean.
- Report commits, release path, rollback path, backup path, tests, public checks, and residual risks.

# Kanyue Deployment Runbook

## Topology

- One business binary, `kanyue.server`: API, embedded PocketBase and the embedded admin SPA.
- Mini program calls `mapi.ikanyue.com` or `xapi.ikanyue.com`; both reach kanyue.server.
- PocketBase public domain: `data.ikanyue.com`.
- Object access domain: `https://kyoss.abcmem.com/ikanyue-mp`.
- OpenResty is expected to terminate/reverse-proxy external traffic.
- 1Panel may own service process orchestration, but Docker Compose is the source of stack state for this repo deployment.

## Required Production Facts To Record

Record these before changing anything:

```bash
rtk git rev-parse HEAD
rtk docker compose ls
rtk docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}'
```

On the server, also record:

```bash
date -u +%Y%m%dT%H%M%SZ
pwd
ls -lah /root/services/dockers
nginx -t || openresty -t
```

## PB Backup

Backup must happen before:

- `kanyue-server migrate up`
- replacing PB volume/data
- switching traffic to a stack that writes to PB

Recommended local-on-server backup:

```bash
./.codex/skills/kanyue-deploy/scripts/backup_pb_data.sh \
  --source /root/services/dockers/pb_data.ikanyue/pb_data \
  --backup-dir /root/services/backups/pocketbase \
  --label pre_deploy
```

Restore command shape:

```bash
systemctl stop <live-service> || docker compose -p <project> stop server
mv /root/services/dockers/pb_data.ikanyue/pb_data /root/services/dockers/pb_data.ikanyue/pb_data.broken.$(date -u +%Y%m%dT%H%M%SZ)
mkdir -p /root/services/dockers/pb_data.ikanyue/pb_data
tar -xzf /root/services/backups/pocketbase/<backup>.tar.gz -C /root/services/dockers/pb_data.ikanyue/pb_data
docker compose -p <project> up -d server
```

Do not restore PB data casually. Restoring a backup discards writes made after the backup.

## Schema Migration

Migrations ship inside the binary and run only on request, against the target data directory:

```bash
docker compose --env-file .env.deploy -p <project> run --rm --entrypoint kanyue-server \
  server migrate up --dir=/pb_data
```

A second run prints `No pending migrations.`; `serve` refuses to start while one is pending and names it.
Migrations only add collections, fields and indexes; nothing present is changed or dropped.

## Bypass Verification

Use alternate ports/project names first. Example local/bypass ports:

```text
admin:      127.0.0.1:18080
api:        127.0.0.1:11337
pocketbase: 127.0.0.1:18090   (all three reach the same server)
```

Run:

```bash
./.codex/skills/kanyue-deploy/scripts/verify_stack.sh --server http://127.0.0.1:11337
```

Manual checks:

```bash
curl -fsS 'http://127.0.0.1:11337/v1/activity/find?page=1&perPage=100'
curl -fsS 'http://127.0.0.1:11337/v1/public/course-catalog'
curl -fsS -H 'Accept: text/html' 'http://127.0.0.1:18080/' 
```

Expected:

- activity list returns `code=10000`
- course catalog returns `code=10000`
- the admin page returns the SPA shell
- image URLs include `https://kyoss.abcmem.com/ikanyue-mp/`
- no `未配置微信小程序的 APPID 或 SECRET` once real WeChat env is configured

## Traffic Switch

Before switch:

- backup archive path recorded
- old compose project/image/commit recorded
- new stack verified by direct port or bypass domain
- OpenResty config syntax passes

Switch by changing OpenResty upstream/proxy target, then reload:

```bash
openresty -t
openresty -s reload
```

If managed by 1Panel, use the 1Panel-managed reload path but still run syntax validation first when available.

## Rollback Order

Prefer the least destructive rollback:

1. Revert OpenResty upstream to old stack and reload.
2. Restart old Docker Compose project if it is still present.
3. Recreate old services from recorded image tags/commits.
4. Restore PB backup only if data/schema mutation broke production and the user explicitly accepts losing writes since backup.

Use:

```bash
./.codex/skills/kanyue-deploy/scripts/rollback_compose.sh --help
```

## Mini Program Validation Notes

For local dev builds:

```bash
cd ikanyue.taro3
NODE_ENV=development pnpm run dev:weapp
```

Do not put `NODE_ENV=development` after the script name; that becomes an argument, not an environment variable.

If testing in WeChat DevTools against `http://127.0.0.1`, disable legal-domain/HTTPS checks. Real-device preview cannot use `127.0.0.1` for Mac-hosted services.

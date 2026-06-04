# Kanyue Deployment Runbook

## Topology

- Mini program can call `mapi.ikanyue.com` or direct Hono.
- Hono backend domain: `xapi.ikanyue.com`.
- PocketBase public domain: `data.ikanyue.com`.
- Object access domain: `https://kyoss.abcmem.com/ikanyue-mp`.
- OpenResty is expected to terminate/reverse-proxy external traffic.
- 1Panel may own service process orchestration, but Docker Compose is the source of stack state for this repo deployment.

## Required Production Facts To Record

Record these before changing anything:

```bash
rtk git rev-parse HEAD
rtk git -C ikanyue.admin rev-parse HEAD
rtk git -C ikanyue.mapi.hono rev-parse HEAD
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

- `ops:schema:apply`
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
systemctl stop <live-service> || docker compose -p <project> stop pocketbase hono
mv /root/services/dockers/pb_data.ikanyue/pb_data /root/services/dockers/pb_data.ikanyue/pb_data.broken.$(date -u +%Y%m%dT%H%M%SZ)
mkdir -p /root/services/dockers/pb_data.ikanyue/pb_data
tar -xzf /root/services/backups/pocketbase/<backup>.tar.gz -C /root/services/dockers/pb_data.ikanyue/pb_data
docker compose -p <project> up -d pocketbase hono
```

Do not restore PB data casually. Restoring a backup discards writes made after the backup.

## Schema Migration

Run schema migration against the target PB, not against a local copy unless doing dry-run validation.

For a host-accessible PB:

```bash
cd ikanyue.mapi.hono
PB_URL=http://127.0.0.1:8090 \
PB_EMAIL="$PB_EMAIL" \
PB_PASSWORD="$PB_PASSWORD" \
npm run ops:schema:apply
```

For a compose network:

```bash
docker compose --env-file .env.production run --rm \
  -e PB_URL=http://pocketbase:8090 \
  -e PB_EMAIL="$PB_EMAIL" \
  -e PB_PASSWORD="$PB_PASSWORD" \
  hono npm run ops:schema:apply
```

Required collections after apply:

```text
assessment_templates
assessment_records
assessment_report_snapshots
assessment_share_links
teacher_student_relations
operation_slots
activity_signups
ops_audit_logs
```

## Bypass Verification

Use alternate ports/project names first. Example local/bypass ports:

```text
admin:      127.0.0.1:18080
hono:       127.0.0.1:1337 or 127.0.0.1:11337
pocketbase: 127.0.0.1:18090
```

Run:

```bash
./.codex/skills/kanyue-deploy/scripts/verify_stack.sh --hono http://127.0.0.1:1337
```

Manual checks:

```bash
curl -fsS 'http://127.0.0.1:1337/v1/activity/find?page=1&perPage=100'
curl -fsS 'http://127.0.0.1:1337/ops/public/operation-slots?channel=wechat-mini&placement=home-banner'
```

Expected:

- activity list returns `code=10000`
- operation slots returns `code=10000`, even if `items=[]`
- image URLs include `https://kyoss.abcmem.com/ikanyue-mp/`
- no `Missing collection context`
- no `每页数量不能超过100`
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

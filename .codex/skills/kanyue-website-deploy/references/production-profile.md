# Production Profile

This is a verified snapshot from 2026-07-20. Treat it as a starting point, not immutable truth.

## Repository

- Parent: `/Users/verdx/Documents/projects/kanyue`
- Website: `/Users/verdx/Documents/projects/kanyue/ikanyue.website`
- Build artifact: `ikanyue.website/.output`
- Runtime: Nuxt 4 / Nitro `node-server`
- Package manager: pnpm

## Public Topology

- VPS: `139.196.252.18`
- SSH: `root@139.196.252.18`
- Primary domain: `https://ikanyue.com`
- Alias: `https://www.ikanyue.com`
- API base: `https://xapi.ikanyue.com`
- Public asset base returned by the API: `https://kyoss.abcmem.com/ikanyue-mp`

## Current Runtime Layout

- Service: `ikanyue-website.service`
- Listener: `127.0.0.1:13000`
- Bypass listener: `127.0.0.1:13001`
- Release root: `/root/services/ikanyue.website/releases`
- Active symlink: `/root/services/ikanyue.website/current`
- Node: `/root/.nvm/versions/node/v22.15.0/bin/node`
- Runtime user: `root`

The current root runtime is an accepted residual risk, not the recommended new-server default. Use a dedicated user and `/opt/ikanyue.website` for a clean migration.

## 1Panel and OpenResty

- 1Panel service: `1panel.service`
- 1Panel root: `/root/panelopt/1panel`
- 1Panel database: `/root/panelopt/1panel/db/1Panel.db`
- OpenResty container: `1Panel-openresty-XfTF`
- OpenResty network mode: `host`
- Domain config: `/root/panelopt/1panel/apps/openresty/openresty/conf/conf.d/ikanyue.com.conf`
- Site root: `/root/panelopt/1panel/apps/openresty/openresty/www/sites/ikanyue.com`
- Proxy config: `/root/panelopt/1panel/apps/openresty/openresty/www/sites/ikanyue.com/proxy/root.conf`
- 1Panel website metadata: `type=proxy`, `proxy=http://127.0.0.1:13000`

Because OpenResty uses host networking, `127.0.0.1:13000` reaches the host Node service. Re-check network mode on another server before copying this upstream value.

## Runtime Environment

```text
NODE_ENV=production
NITRO_HOST=127.0.0.1
NITRO_PORT=13000
NUXT_PUBLIC_API_BASE=https://xapi.ikanyue.com
NUXT_PUBLIC_SITE_URL=https://ikanyue.com
```

## Verified Content Probes

- Homepage contains `全年龄声乐课程`.
- Footer contains `沪ICP备2024042646号-1` linked to `https://beian.miit.gov.cn/`.
- Contact page contains `微信/电话咨询`.
- Phone link is `tel:18521301857` and includes a Lucide phone icon.
- QR caption is `长按识别或扫码`.
- QR asset is `/images/wechat-contact-qr.jpg`.
- Activities contain production records from Hono, including `通俗唱法高音问题与方法` in the current dataset.

Use stable structural probes first. Treat activity titles as replaceable content and override the expected activity text when production records change.

## Existing Backup Convention

- Backup root: `/root/services/backups/ikanyue.website`
- Release directories: `<UTC timestamp>-<website commit prefix>`
- Keep a `ROLLBACK.txt` whenever OpenResty or 1Panel state changes.
- Preserve at least the active and immediately previous releases.

# 1Panel Proxy Metadata

## Preferred Path

Create or convert the website through the 1Panel UI/API. The website list must identify `ikanyue.com` as a reverse-proxy site with upstream `http://127.0.0.1:13000`.

Use the native proxy include structure so later 1Panel edits do not overwrite a hand-written `location /` block:

```nginx
include /www/sites/ikanyue.com/proxy/*.conf;
```

Place the upstream in `proxy/root.conf`.

## Detect Drift

Drift exists when OpenResty proxies Nuxt correctly but the 1Panel `websites` row still says `type=static` or has an empty `proxy` value.

Inspect safely:

```bash
node --no-warnings --experimental-sqlite \
  /tmp/onepanel-site-metadata.mjs \
  --database <1Panel.db> \
  --domain ikanyue.com \
  --proxy http://127.0.0.1:13000
```

The default mode is dry-run and never writes.

## Required Backup

Before applying metadata changes:

1. Back up the current OpenResty domain config.
2. Archive the current website directory.
3. Create a consistent SQLite backup with `backup-1panel-db.mjs`.
4. Verify `PRAGMA integrity_check` returns `ok` on the backup.
5. Record the pre-change website row and rollback commands.

Never use a plain database copy as the only backup while 1Panel is active. Prefer `VACUUM INTO` or another SQLite online backup mechanism.

## Guarded Fallback Apply

Use direct SQLite only when the 1Panel UI/API cannot represent the already-working proxy and the user has authorized the correction.

```bash
node --no-warnings --experimental-sqlite \
  /tmp/onepanel-site-metadata.mjs \
  --database <1Panel.db> \
  --backup <verified-backup.db> \
  --domain ikanyue.com \
  --proxy http://127.0.0.1:13000 \
  --apply
```

The script must:

- find exactly one website row
- verify the backup is readable and internally consistent
- update only `type`, `proxy`, `proxy_type`, and `updated_at`
- use a transaction
- re-read and assert the final values

Restart `1panel.service` after the update so the panel reads fresh metadata. This does not require restarting OpenResty unless its configuration also changed.

## OpenResty Conversion Order

When converting a static site:

1. Keep the old static directory intact.
2. Install `proxy/root.conf`.
3. Replace `root` and static 404 directives in the domain config with the proxy include.
4. Run `openresty -t`.
5. Apply the 1Panel metadata update.
6. Restart 1Panel.
7. Reload OpenResty.
8. Verify public traffic and the website list.

If syntax or metadata validation fails, restore the domain config, remove the new proxy directory, reload OpenResty, and leave the database untouched or restore it from the verified backup.

## Database Schema Snapshot

Relevant columns in the validated 1Panel version:

```text
websites.id
websites.primary_domain
websites.type
websites.proxy
websites.proxy_type
websites.updated_at
```

Do not assume this schema on another 1Panel version. Inspect `sqlite_master` first and stop if required columns differ.

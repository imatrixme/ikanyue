# PocketBase storage assets

This directory versions storage-only PocketBase assets required by the backend.

- `pb_migrations/`: collection and index migrations.
- Hono owns all backend business logic and writes through the authenticated PocketBase JavaScript SDK, using the Batch API for multi-record transactions.
- `pb_hooks/` must not exist. Record lifecycle hooks, custom PocketBase routes, scheduled hooks, and `$app.runInTransaction` business commands are forbidden for all backend business logic.
- PocketBase runtime commands must not declare `--hooksDir`; scheduled work is started outside PocketBase and calls a Hono service or command endpoint.

PocketBase remains the storage boundary. Browser and mini-program clients must never call private course-credit collections or the Batch API directly.

## Verified Runtime

- Production Compose image: `elestio/pocketbase:v0.32.0`.
- Verified against a read-only production-volume copy on 2026-07-17.
- `migrate up`, full `migrate down`, and re-apply succeeded for all three course-credit migrations.
- The Hono-side SDK batch probe proved rollback across `reconciliation_runs` and `outbox_events` after an injected failure.
- `pb.createBatch()` successfully committed the same two collections in one request on the local production-volume copy.
- A real Hono integration test proved one-winner behavior for two concurrent reservations competing for the final credit.
- PocketBase business hooks are deliberately absent. Order grants, session reservations, conversions, lifecycle changes, class membership, teacher assignment, and session publication are Hono commands. Expiry and Outbox scheduling call the authenticated Hono worker routes, while reconciliation uses its explicit Hono action route. Immutable events and versioned rules are create-only in the Hono batch repository, and transaction rollback is verified through the SDK Batch API probe.

Repository guard:

```bash
pnpm run verify:no-pocketbase-hooks
```

The guard scans backend source, scripts, PocketBase assets, and checked-in runtime configuration. It fails on a `pb_hooks` directory, `.pb.js` file, PocketBase hook API, or hooks runtime option, and is also part of `pnpm run lint`.

`credit_batches.expiryPolicy` and `credit_batches.grantSnapshot` remain nullable
at the collection layer so a production migration does not make historical
batches unwriteable. New grant commands always populate both fields; historical
backfill requires explicit operator mapping rather than inferred policy.

Local verification command:

```bash
PB_URL=http://127.0.0.1:18091 \
PB_EMAIL=course-credit-local@ikanyue.invalid \
PB_PASSWORD='<local password>' \
pnpm run course-credits:verify:pocketbase
```

Unit and transaction-repository coverage command:

```bash
pnpm run course-credits:test:coverage
```

The coverage gate includes the course-credit domain and schema modules,
migration generator, local PocketBase verifier, and Hono transaction repositories.
Lines, branches, functions, and statements each have an
independent 95% threshold. The Docker-backed verifier remains a separate
runtime compatibility and transaction proof.

The real Hono grant-and-reservation path can be exercised against the same
loopback-only copy with:

```bash
PB_URL=http://127.0.0.1:18091 \
PB_EMAIL=course-credit-local@ikanyue.invalid \
PB_PASSWORD='<local password>' \
pnpm run course-credits:test:pocketbase-business
```

## Local backup and restore

Backup and restore commands reject non-loopback PocketBase URLs. Backup names
must be lowercase and end in `.zip`. On a production-volume copy whose backup
settings point to S3, `PB_BACKUP_STORAGE=local` temporarily disables backup S3,
downloads the archive locally, and restores the original setting afterward.

```bash
PB_URL=http://127.0.0.1:18091 \
PB_EMAIL=course-credit-local@ikanyue.invalid \
PB_PASSWORD='<local password>' \
PB_BACKUP_STORAGE=local \
pnpm run course-credits:backup -- .local/course-credit-backups/course-credit-local.zip
```

Restore is destructive for the local PocketBase runtime and requires an exact
filename confirmation. PocketBase 0.32 stages the restored files; keep the
uploaded backup in place, restart PocketBase, and only then finalize the
restore. When local storage temporarily replaced S3, finalization requires an
explicit decision about re-enabling S3.

```bash
PB_URL=http://127.0.0.1:18091 \
PB_EMAIL=course-credit-local@ikanyue.invalid \
PB_PASSWORD='<local password>' \
PB_BACKUP_STORAGE=local \
PB_RESTORE_CONFIRM=course-credit-local.zip \
pnpm run course-credits:restore -- .local/course-credit-backups/course-credit-local.zip

# Restart the PocketBase process or container here, then verify the restored data.

PB_URL=http://127.0.0.1:18091 \
PB_EMAIL=course-credit-local@ikanyue.invalid \
PB_PASSWORD='<local password>' \
PB_BACKUP_STORAGE=local \
PB_RESTORE_CONFIRM=course-credit-local.zip \
PB_RESTORE_REENABLE_S3=false \
pnpm run course-credits:restore:finalize -- .local/course-credit-backups/course-credit-local.zip
```

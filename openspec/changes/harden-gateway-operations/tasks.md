## 1. P0 Zero-downtime upgrade
- [x] 1.1 Sync loop: every 5 seconds reload environments whose latest `stage_versions` is newer than served, and rebuild endpoints when the online instance fingerprint changes; tests
- [x] 1.2 `compose.yaml`: `gateway-standby` on ports 1470/1471 sharing the data volume; 30 s stop grace period for both
- [x] 1.3 `scripts/gateway-rollout.mjs`: build → standby up → healthy → recreate primary → healthy → standby stop; unit tests for the step plan
- [x] 1.4 README: OpenResty upstream with `backup` and `proxy_next_upstream`, the rollout, and what not to do during it
- [x] 1.5 Local proof: two gateway processes on one data dir behind a failover proxy, no failed requests while the primary restarts (2026-10-28: 16 clients through an nginx-like backup proxy, primary down 8 s: 234,589 responses, all 200)

## 2. P0 CI
- [x] 2.1 `.github/workflows/gateway.yml`: gofmt, vet, Go tests, `govulncheck`, console lint/test/build, `gateway-exposure` test, path filters
- [x] 2.2 Fix whatever `govulncheck` reports today, or record why it is not reachable

## 3. P0 Encryption key rotation
- [x] 3.1 `serve` holds a shared lock on `gateway.lock`; commands that rewrite secrets need the exclusive lock
- [x] 3.2 `rotate-key`: backup, decrypt-all check with the old key, one transaction re-sealing every `enc:v1:` value, PocketBase settings, last-known-good files, compile check with the new key, audit entry
- [x] 3.3 Tests: round trip, wrong old key aborts without writes, running gateway blocks it, released versions still compile after rotation
- [x] 3.4 README: rotation steps and keeping the old key for old backups

## 4. P0 Target machine (external)
- [x] 4.0 Drill tooling, so each external task is one command on the VPS (steps in `kanyue.gateway/README.md` “目标机器验证”):
  - [x] 4.0.1 Prometheus process metrics: resident memory (Linux), heap, goroutines, telemetry database size
  - [x] 4.0.2 `kanyue-gateway backup verify [name] --max-age`: newest backup from S3 or local storage restored into a scratch dir; integrity, migrations, every environment's latest release compiles with the current key; non-zero exit on failure
  - [x] 4.0.3 `kanyue-pay maintenance backup payment|business --latest`: verify the newest scheduled backup instead of creating one, `BACKUP_STALE` after 26 h; maintenance failures now exit non-zero
  - [x] 4.0.4 `scripts/gateway-drill.mjs` `load` (D9 profiles with a direct baseline), `soak` (rate-paced, per-minute samples, leak and telemetry verdict), `rollout` (counts every failed request around `gateway-rollout.mjs`); unit and end-to-end tests in CI
  - [x] 4.0.5 Local proof on the native stack (2026-10-28): load 26k req/s, gateway P99 2.5 ms vs direct 1.52 ms, 0 failed; 1-minute soak at 100 req/s, 0 failed; rollout drill around a plain restart (no standby) reported 16 ECONNREFUSED and failed as it should; `backup verify` and `--latest` restored the local backups
- [ ] 4.1 Load test on the target profile and a 24 h soak (memory, telemetry growth)
- [ ] 4.2 Restore drill from the real S3 bucket
- [ ] 4.3 Compare the Aliyun API Gateway capabilities in use and close gaps
- [ ] 4.4 Run `gateway-rollout.mjs` behind the real OpenResty under load

## 5. P1 Machine tokens and roles
- [x] 5.1 `admin_tokens` (hashed, role, stages, expiry, last use), roles viewer / releaser / admin, enforced on the admin API
- [x] 5.2 Optional second approval for RELEASE; audit of requests and approvals
- [x] 5.3 Console: tokens, roles and approvals

## 6. P1 Configuration as code
- [x] 6.1 `config export` / `config apply` (drafts only, diff output, secrets by name)
- [x] 6.2 Console comparison of two environments

## 7. Later, when needed
- [x] 7.1 Prometheus scrape endpoint (`/gateway/v1/prometheus`, viewer token) and OpenTelemetry export (OTLP/HTTP JSON request spans as an exporter format)
- [x] 7.2 Request validation against the operation's OpenAPI schema (`request-validation`; query, header and JSON body from the manifest; services still have to declare their schemas)
- [x] 7.3 Response header rewrite (already in `request-rewrite`; framing headers now refused, covered end to end)
- [x] 7.4 Upgrade PocketBase to v0.39.11 (system migrations verified on a copy of the local data; GO-2026-5548 and GO-2026-6489 closed and dropped from `govulncheck-accepted.txt`; SQL console disabled)

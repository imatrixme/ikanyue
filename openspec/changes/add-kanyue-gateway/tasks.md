## 0. Prerequisites
- [ ] 0.1 (API list and domain settled: Aliyun exposes only the mini program calls on `mapi.ikanyue.com`; capability rows still open) Obtain the Aliyun API Gateway export (APIs, stages, throttling, IP control, plugins, custom domains) and resolve every "待确认" row in `design.md`
- [ ] 0.2 Confirm VPS provider/region (not tied to Aliyun; ICP filing is out of scope by decision)
- [ ] 0.3 Pick the alert channel(s); local ports default to `1460` (data plane) and `1461` (admin plane)

## 1. G0 Foundation
- [x] 1.1 Scaffold `kanyue.gateway` Go module with embedded PocketBase v0.32.0 (the separate telemetry SQLite file arrives with logging in 3.1)
- [x] 1.2 Config schema: sites, services, instances, operations, routes, config versions, audit (stages are instance labels; plugin bindings, consumers and alert rules arrive with 2.1, 2.3 and 3.5)
- [x] 1.3 Snapshot compiler: validate → compile per-site `ServeMux` route tables → versioned snapshot; atomic swap in the data plane; last-known-good snapshot on disk
- [x] 1.4 Data plane reverse proxy: streaming, upstream keepalive pool, connect and response-header timeouts, HTTP/1.1, h2c, WebSocket, SSE (body limits and total/idle route timeouts arrive with 2.2)
- [x] 1.5 Trusted-hop client IP resolution and mandatory `X-Forwarded-For`/`X-Real-IP`/`X-Forwarded-Proto`/`X-Forwarded-Host`/`X-Request-Id`/`traceparent`; verified live that `kanyue.server` hides `/api/*`, `/_/` and the manifest behind the gateway
- [x] 1.6 Service discovery: self-registration + heartbeat + deregistration (registration token), DNS resolution, confirmed static entries; instance expiry
- [x] 1.7 Manifest from the router itself in `kanyue.server` and `kanyue.pay` (`gatewaylink`); internal-only `/internal/gateway/manifest` (OpenAPI 3.1 with module, auth scope, idempotency); heartbeat registration from `GATEWAY_*` env
- [x] 1.8 Guard tests that every served route is in the manifest with a module and a classified auth scope, and vice versa
- [x] 1.9 Gateway pulls manifests on registration/hash change; new operations go to "pending", removed ones are marked, logged and block publishing routes that select them (alerting arrives with 3.5)
- [x] 1.10 Exposure plan instead of a Swagger importer: `internal/exposure/mapi.json` lists the mini program calls, `kanyue-gateway exposure apply mapi` writes the site and route as a draft; guarded by `scripts/gateway-exposure.test.mjs` and the kanyue.server manifest test
- [x] 1.11 Graceful shutdown (deregister, drain) and `SO_REUSEPORT` restart

## 2. G1 Aliyun replacement
- [x] 2.1 Plugin interface (`Request`/`Response`/`Log`, JSON Schema, compile-time `Build`) and global → site → route → consumer binding order
- [x] 2.2 Built-in plugins: `request-rewrite`, `body-limit`, `mock`, `maintenance` (`request-id` is always on in the data plane, not a plugin; see D4)
- [x] 2.3 Auth plugins: `jwt-auth` (same secret/rules as `kanyue.server`), `aliyun-signature`, `replay-guard`, `ip-restriction`, `cors`
- [x] 2.4 `rate-limit` per API/consumer/user per second/minute/day behind a replaceable limiter interface
- [x] 2.5 Load balancing (weighted round robin, least in-flight, consistent hash), active/passive health checks, idempotent-only retry
- [x] 2.6 `circuit-breaker`, `fallback`, `traffic-split`, `mirror`
- [x] 2.7 Aliyun-compatible response headers (`X-Ca-Request-Id`, `X-Ca-Error-Message`)
- [x] 2.8 Publish with pre-checks, version history, one-click rollback, audit
- [x] 2.9 Admin console: services/instances, operations picker, routes, plugin forms from schema, consumers, versions, audit; internal-only bind; superuser TOTP; encrypted secrets (React + Vite + TS + Tailwind in `console/`, embedded at `/console/`)
- [ ] 2.10 Parity test suite: one case per in-use Aliyun capability; `kanyue.server` contract tests pass through the gateway (contract tests pass through the gateway locally with `COMPARE_URL`, student cases skipped without local student credentials; per-capability cases blocked on 0.1)

## 3. G2 Observability
- [x] 3.1 Async batched request log with error/slow full retention, success sampling, bounded queue and drop counter
- [x] 3.2 Per-minute route metrics (count, status classes, P50/P95/P99, bytes) aggregated in memory
- [x] 3.3 Outbound-call reporting from `kanyue.server` and `kanyue.pay` (pay, WeChat, object storage, outbox webhooks)
- [x] 3.4 Dependency graph and traffic views in the console
- [x] 3.5 Alert rules, built-in templates (5xx ratio, P95, no healthy instance, breaker open, payment callback failures, outbox dead letters, dropped logs, certificate expiry), webhook channels, recovery notices
- [x] 3.6 Retention jobs (logs 7 days, metrics 90 days by default)

## 4. G2 Integrations (minimal)
- [x] 4.1 `LogStore` interface for console log queries with the local SQLite implementation only
- [x] 4.2 `Exporter` interface and the JSON lines over HTTP exporter (VictoriaLogs `/insert/jsonline` field mapping, optional Basic/Bearer auth, sampling, filters, batching, backoff, drop counter, `Probe`, "export failing" alert)
- [x] 4.3 Default redaction (`token`, `Authorization`, cookies, bodies, personal data) and optional IP truncation for local logs and exports
- [x] 4.4 Enable PocketBase `--encryptionEnv` and scheduled S3 backups in `kanyue.gateway`, `kanyue.server` and `kanyue.pay`; report the last backup result in heartbeats; gateway shows status and alerts on missed backups
- [ ] 4.5 Restore drill: restore one S3 backup of each service into a scratch data dir and run its checks (procedure in `kanyue.gateway/README.md`; needs the real S3 bucket)
- [x] 4.6 Deploy note for same-host VictoriaLogs: loopback bind, `-retentionPeriod`, memory limit, access to its UI via SSH tunnel or authenticated 1Panel proxy

## 5. G3 Cutover
- [ ] 5.1 Load test against the `design.md` targets on 1C1G and 2C4G profiles (local `-tags load` harness done: 34k req/s, p99 3 ms, heap 13 MB with jwt-auth + rate-limit; VPS profiles pending)
- [x] 5.2 Add `gateway` to `compose.yaml` and `scripts/native-stack.mjs` (+ tests); 1Panel OpenResty site config
- [x] 5.3 Update `README.md`, `AGENTS.md`, `GEB.MD` §8 and the deploy skill
- [ ] 5.4 Shadow-run on the VPS, real-device mini program run-through, payment callback via the gateway
- [ ] 5.5 Switch DNS, keep Aliyun gateway as rollback until the observation window closes

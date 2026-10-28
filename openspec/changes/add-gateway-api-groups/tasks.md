## 0. Prerequisites
- [x] 0.1 User confirms D3: policy sets do not compose (one source per layer, no nesting)
- [ ] 0.2 Archive `add-kanyue-gateway` so the modified requirements exist in `openspec/specs` (open: it still has external tasks such as the VPS cutover)

## 1. P1 Model and releases
- [x] 1.1 Collections: `api_groups`, `group_domains`, `apis`, `policy_sets` (with the built-in `baseline`), `grants`, `releases`; audit gains before/after/diff and becomes append-only
- [x] 1.2 Effective policy resolver: five layers, override vs stack kinds, locks validated on save, stage filters, priority order; unit tests per rule
- [x] 1.3 Release service: resolve, diff, precheck (health per stage, path conflicts by priority, schema, removed operations, private needs signature), PRE→RELEASE difference with reason, force with reason; offline and rollback as releases
- [x] 1.4 Per-stage snapshots and last-known-good files; environment resolution (fixed domain > `X-Ca-Stage` > `RELEASE`); logs and metrics gain group, API and stage
- [x] 1.5 Migration from sites/routes/bindings/published snapshot with a backup first; old collections read-only; parity test of every stage before and after
- [x] 1.6 Admin API: release, offline, rollback, impact preview, effective policies; retire `/gateway/v1/publish` and `/gateway/v1/rollback`
- [x] 1.7 Exposure plan v2 (group, domains, APIs) and `exposure apply` as drafts; update `scripts/gateway-exposure.test.mjs` and the kanyue.server manifest test

## 2. P2 Policies
- [x] 2.1 Visibility and authentication fields bring their plugins; private APIs require signature and a grant per stage
- [x] 2.2 Application grants and application-specific settings (layer 5)
- [x] 2.3 Path priority on APIs and conflict reporting

## 3. P3 Console
- [x] 3.1 Groups list and group detail with per-stage status and bulk release
- [x] 3.2 API detail: definition, effective policies with source and locks per stage, versions, diffs, history, rollback
- [x] 3.3 Policy sets: items, locks, references, impact preview; hints for unused and single-use sets
- [x] 3.4 Release dialog (stage, diff, precheck, reason), release log, audit with diffs, applications and grants
- [x] 3.5 Browser smoke of create → release TEST → PRE → RELEASE → rollback (Playwright on a scratch copy of the native data with a throwaway TOTP superuser: register a mapi API draft, release each stage with the data plane checked per stage, offline and rollback in RELEASE, effective policies, history and audit)

## 4. Rollout
- [x] 4.1 Update `kanyue.gateway/README.md`, deploy skill and runbook, `GEB.MD` §8 (no deploy skill or runbook exists; README carries the deploy steps)
- [x] 4.2 Run the migration on the native stack and the kanyue.server contract tests through every stage before the `mapi.ikanyue.com` cutover (native data migrated: 2 groups, 262 APIs, every stage v1; contracts pass through the `*` group in TEST, PRE and RELEASE with read parity against the server; through `mapi` every gateway 404 is an operation outside the plan and every exposed operation reaches the server; repeat against the VPS before the cutover)

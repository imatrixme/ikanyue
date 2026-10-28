## 0. Prerequisites
- [x] 0.1 User confirms D3: policy sets do not compose (one source per layer, no nesting)
- [ ] 0.2 Archive `add-kanyue-gateway` so the modified requirements exist in `openspec/specs`

## 1. P1 Model and releases
- [ ] 1.1 Collections: `api_groups`, `group_domains`, `apis`, `policy_sets` (with the built-in `baseline`), `grants`, `releases`; audit gains before/after/diff and becomes append-only
- [ ] 1.2 Effective policy resolver: five layers, override vs stack kinds, locks validated on save, stage filters, priority order; unit tests per rule
- [ ] 1.3 Release service: resolve, diff, precheck (health per stage, path conflicts by priority, schema, removed operations, private needs signature), PRE→RELEASE difference with reason, force with reason; offline and rollback as releases
- [ ] 1.4 Per-stage snapshots and last-known-good files; environment resolution (fixed domain > `X-Ca-Stage` > domain default); logs and metrics gain group, API and stage
- [ ] 1.5 Migration from sites/routes/bindings/published snapshot with a backup first; old collections read-only; parity test of every stage before and after
- [ ] 1.6 Admin API: release, offline, rollback, impact preview, effective policies; retire `/gateway/v1/publish` and `/gateway/v1/rollback`
- [ ] 1.7 Exposure plan v2 (group, domains, APIs) and `exposure apply` as drafts; update `scripts/gateway-exposure.test.mjs` and the kanyue.server manifest test

## 2. P2 Policies
- [ ] 2.1 Visibility and authentication fields bring their plugins; private APIs require signature and a grant per stage
- [ ] 2.2 Application grants and application-specific settings (layer 5)
- [ ] 2.3 Path priority on APIs and conflict reporting

## 3. P3 Console
- [ ] 3.1 Groups list and group detail with per-stage status and bulk release
- [ ] 3.2 API detail: definition, effective policies with source and locks per stage, versions, diffs, history, rollback
- [ ] 3.3 Policy sets: items, locks, references, impact preview; hints for unused and single-use sets
- [ ] 3.4 Release dialog (stage, diff, precheck, reason), release log, audit with diffs, applications and grants
- [ ] 3.5 Browser smoke of create → release TEST → PRE → RELEASE → rollback

## 4. Rollout
- [ ] 4.1 Update `kanyue.gateway/README.md`, deploy skill and runbook, `GEB.MD` §8
- [ ] 4.2 Run the migration on the native stack and the kanyue.server contract tests through every stage before the `mapi.ikanyue.com` cutover

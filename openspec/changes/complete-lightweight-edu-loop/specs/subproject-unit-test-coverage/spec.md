## ADDED Requirements

### Requirement: Lightweight Loop Coverage Gates
The change SHALL prove 90%+ coverage for every affected subproject using that subproject's own test command.

#### Scenario: Taro coverage gate passes
- **WHEN** `pnpm run test:coverage` runs in `ikanyue.taro3`
- **THEN** the command passes with at least 90% branch coverage and reports the measured line, branch, function, and statement coverage

#### Scenario: Hono coverage gate passes
- **WHEN** `npm run test:coverage` runs in `ikanyue.mapi.hono`
- **THEN** the command passes with at least 90% line, branch, and function coverage

#### Scenario: Admin coverage gate passes
- **WHEN** `npm run test:coverage` runs in `ikanyue.admin`
- **THEN** the command passes with at least 90% line, branch, function, and statement coverage

### Requirement: Lightweight Loop Build and E2E Gates
The change SHALL include repeatable build and workflow verification for the affected subprojects.

#### Scenario: Taro build and runtime verification pass
- **WHEN** `pnpm run build:weapp` and the miniapp runtime verification script run in `ikanyue.taro3`
- **THEN** both commands pass and cover signup, personal content, report, and operation-slot entry points

#### Scenario: Hono schema and Swagger gates pass
- **WHEN** `npm run ops:schema:check`, `npm run lint`, and `npm run swagger:build` run in `ikanyue.mapi.hono`
- **THEN** all commands pass and generated Swagger includes the signup and report APIs touched by this change

#### Scenario: Admin build and E2E pass
- **WHEN** `npm run lint`, `npm run build`, and `npm run test:e2e` run in `ikanyue.admin`
- **THEN** all commands pass and E2E covers login, publishable content editing, signup review, report detail, share preview, and role gating

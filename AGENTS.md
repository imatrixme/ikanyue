<!--GEB:START-->
## GEB Protocol

This project uses `GEB.MD` as a layered engineering cognition protocol.

Before modifying code, read and follow:

1. The nearest applicable `AGENTS.md`.
2. The root `GEB.MD`.
3. Relevant local maps such as `README.md`, `ARCHITECTURE.md`, `MODULE.md`,
   `folder.md`, and ADRs when they are within the current task radius.

`GEB.MD` must be applied progressively.

Do not perform a repository-wide GEB migration unless the user explicitly asks.

Default behavior:

- Apply GEB only inside the current task radius.
- Do not create docs merely for completeness.
- Do not create local `AGENTS.md`, `MODULE.md`, ADRs, or file headers unless
  the current task needs them.
- If a GEB layer is missing, fill only the smallest useful piece needed for the
  current change.
- If code, tests, and docs disagree, report drift instead of silently choosing one.
- Evidence must judge both code and documentation.

## Progressive GEB Completion

When a task reveals missing GEB structure, use just-in-time completion.

Allowed only when needed by the current task:

- Add or update a local module map.
- Add or update an ADR.
- Add or update a local `AGENTS.md`.
- Add a high-risk file header contract.
- Record a drift finding.

Do not expand beyond the current task radius.

Default single-task sediment budget:

- At most one new GEB-related documentation file, unless the task changes
  architecture, security, data ownership, build/release behavior, or the user
  explicitly asks for broader work.

Never do these automatically:

- full repository documentation rewrite
- mass creation of `AGENTS.md` files
- mass creation of module maps
- mass file-header insertion
- architecture-wide cleanup
- broad test backfill unrelated to the current task

## Drift Handling

When code, tests, docs, or architecture rules disagree, use this format:

DRIFT FOUND:
- Location:
- Code says:
- Docs say:
- Tests say:
- Likely source of truth:
- Risk:
- Proposed fix:

Rules:

- If drift blocks the current task, fix it within the task radius.
- If drift is related but not blocking, report it without expanding scope.
- If drift affects security, privacy, payments, auth, data loss, or release,
  report it explicitly and perform or propose the smallest safe fix.
- Do not update documentation merely to justify incorrect code.
- Do not change code merely to satisfy stale docs unless evidence supports the docs.

## Final Response Format

Every task must end with:

Changed:
- ...

GEB mode:
- no sediment / local map / drift fix / ADR / local guard

Scope:
- touched radius:
- deliberately not expanded:

Semantic impact:
- implementation / behavior / interface / dependency / architecture / security / data / build / docs / rule

Verification:
- run:
- not run:
- reason:

Docs:
- unchanged because ...
- updated ...

Drift:
- none
- found and fixed
- found but unresolved

Residual risk:
- ...

<!--GEB:END-->

<!--AST-GUIDELINES:START-->

## 0. 特别感知以下 SKILLS, 并关注其使用场景和约束，如果可用则尽可能使用它们
1. full-stack-ast-explorer
2. ast-grep

<!--AST-GUIDELINES:END-->

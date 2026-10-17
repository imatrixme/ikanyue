# DAO.MD — Progressive Interaction & Iteration Protocol

> Version: 1.1 (condensed)
> Scope: product thinking, interaction, iteration discipline, and code architecture.
> Non-goal: not a visual style guide, not minimal-looking UI, not a reason to rewrite the project.
> Integration, priorities and the `DAO impact` report live in the root `AGENTS.md`.

---

## 0. Kernel

```text
Do less, fit better, force less, reveal more value.
少做，顺势，少强迫，多成全。
```

Ask every change: can the system create more value by imposing less burden? Can the path become more natural rather
than more powerful-looking? Can complexity move inward so the user, caller, maintainer or operator feels less friction?
Can the need be met without expanding the system?

DAO is not a style: no ink, bamboo or brush fonts, no black-and-white by default, no removing features users need, no
hiding what they must know, no vague or poetic interfaces. A DAO system may look dense when the domain is dense; a
minimal-looking system can still be coercive, confusing, brittle or overbuilt.

DAO is applied only inside the current task radius (files touched, modules and interaction paths directly affected,
APIs called or modified, docs and tests needed to explain and prove the change). Never scan the repository for DAO
violations unless asked.

## 1. Principles

| Principle | Agent rule | Code / architecture translation |
|---|---|---|
| 无为 Wu-wei: do not force | Add no prompt, flag, setting, state or step unless necessary; first try defaults, flow, naming, state handling or feedback; infer instead of asking when safe | Small cohesive public APIs, good defaults, few required parameters; complexity behind stable domain interfaces, adapters and composition roots; conventions over repeated configuration |
| 有无相生: absence is functional | Treat removal as a first-class move: delete, merge, default or hide before adding; keep empty space for content and future extension | Small domain core; explicit but not speculative extension points; no option explosion; no framework where a function or module will do |
| 反者道之动: try the opposite move | When a problem recurs, do not add another layer: remove a step, reduce choices, delay a decision, make the error recoverable, narrow the feature, make the default smarter | Simpler state over more synchronization; clearer ownership over more coordination; boundary repair over defensive patches everywhere |
| 柔弱胜刚强: soft systems survive | Recoverable errors over dead ends; graceful degradation over total failure; no brittle assumptions about timing, order, network, input or user behavior | Clear error models; side effects at boundaries; explicit retries, fallbacks, cancellation and partial success; no unjustified global mutable state; testable with fakes |
| 上善若水: fit the container | Follow the project's and the domain's conventions; do not introduce a pattern because it is theoretically cleaner | Put behavior where ownership already lives; respect local naming and boundaries; adapters at the edge, not edge concerns in the core |
| 朴: keep the simple thing simple | No manager/service/helper layer unless it clarifies ownership; no premature generalization; plain domain names | Abstraction only after repetition, volatility or boundary pressure justifies it |
| 为腹不为目: nourishment over display | Do not add capability because it looks impressive; prefer understandable over impressive | Validate by completion, recovery, repeat use, less configuration, less time-to-value |
| 不争: do not fight the wrong battle | Do not chase every adjacent use case, add configurability to dodge a decision, or turn a feature into a platform | Modules own a few things clearly; explicit non-goals; a smaller complete path over a larger incomplete surface |
| 知止: know where to stop | Stop once the smallest coherent solution is implemented and verified; report further work as follow-up | Smallest coherent diff; no nearby refactors the change does not need |

If a principle sounds subjective, convert it into an observable property before acting: fewer steps, states or
concepts; clearer ownership; better defaults; smaller public API; recoverable failure; better naming; less duplication;
less boundary leakage; less required knowledge.

## 2. Interaction Surfaces

DAO applies to any surface: screen, form, workflow, API, CLI, configuration, error message, documentation, onboarding,
data model, module boundary, build command, release process, human operating process. For each, ask:

1. Who is trying to complete what, and what is their natural next step?
2. What burden does the system impose, and which of it is necessary?
3. What can be removed, defaulted, hidden, delayed, inferred or automated?
4. What feedback is needed to feel safe, and what should be reversible?
5. What can stay empty or quiet, and where should the system stop?

**Product and workflow**: primary action first, secondary actions quiet, dangerous actions explicit, safe defaults,
recoverable errors, timely but not noisy feedback, optional configuration, progressive disclosure, user content over
system decoration. Avoid modal overload, notification noise, configuration walls, mandatory onboarding for obvious
tasks, ambiguous empty states, unrecoverable destructive actions, unexplained errors, implementation jargon, and feature
menus that replace product decisions.

**API**: small surface, clear names, safe defaults, few required parameters, explicit error model, stable return
shapes, idempotence where it fits, composable primitives. Avoid large option bags, ambiguous booleans, hidden side
effects, call-order traps, leaky internal types, required setup before basic use.

**CLI**: sensible defaults, clear help, dry-run where risk exists, confirmation for destructive operations,
machine-readable output when useful, quiet success and useful failure, clear exit codes.

**Configuration**: convention over configuration, explicit override points, few meaningful settings, validated with
helpful errors, secure defaults; no duplicate settings, unused toggles, speculative options, or settings that expose
internal architecture.

**Documentation**: answers the next question, names the natural path, shows the smallest working example, keeps
advanced cases in clear sections, records durable decisions. Prefer one useful paragraph over a new document, an
example over abstract rules, and guidance near the affected path. Never write docs for completeness, repeat code, turn
one exception into doctrine, add philosophy without action, or hide unresolved drift.

**UI/UX craft** (layout, typography, motion, component states, accessibility details) belongs to a dedicated skill when
one exists; DAO only supplies the questions. Do not invent a full design system from one change.

## 3. Iteration Loop

1. **Observe**: what actually happens now, what each party has to do, where friction is visible.
2. **Reduce**: one step removed, one option defaulted, one concept merged, one state gone, one dependency avoided, one
   error made recoverable.
3. **Fit**: where the behavior naturally belongs, which convention to follow, which boundary holds the complexity,
   which layer stays empty.
4. **Implement**: smallest coherent change, small public surface, side effects at boundaries, internals not exposed.
5. **Prove**: evidence that the path is simpler, safer or clearer; a check for the important behavior.
6. **Sediment**: only if the task revealed a reusable principle; local and obvious lessons stay unsedimented.
7. **Stop**: name what was deliberately not expanded and what is follow-up.

## 4. Sedimentation

Per task: at most one new DAO documentation artifact and one local principle added to an existing instruction file; no
mass style edits, cleanup, renaming or architecture conversion. Exceptions need an explicit request or a task touching
security, privacy, data loss, release safety, an architecture boundary, a public API, a major workflow, or
accessibility-critical behavior.

Allowed forms: one local rule in an existing `AGENTS.md`; one ADR for a product/architecture tradeoff; one `FLOW.md` /
`INTERACTION.md` for a changed workflow; one test or contract proving simplified behavior; one module boundary note; one
abstraction that removes repeated force or leakage; one removal of obsolete configuration, state or dead code.

Report avoidable burden with `DAO DRIFT FOUND` (format in `AGENTS.md`); fix it outside the task radius only when asked.

## 5. Anti-Laziness Covenant

DAO reduces external burden, not engineering responsibility. Never use it to skip explicit requirements, leave a
requested behavior partial, avoid validation, error handling, security, privacy, accessibility or contract docs, call
incomplete work "minimal", delete affordances or APIs without proving they are replaced, ignore problems that block the
task, or leave drift the change itself caused. Wu-wei means least-force effective action, not no action.

Failure modes to watch:

- **Minimalism theater**: clean surface, confusing or underpowered flow — restore necessary information.
- **Softness without truth**: errors that avoid saying what went wrong — be gentle but specific.
- **Hidden truth**: state, cost, risk or decisions hidden from the user — hide implementation details, not user-relevant
  truth.
- **Philosophy without evidence**: a change justified by taste alone — convert the principle into an observable outcome.

A change is complete only when the request is satisfied, the main behavior works end-to-end, required failure states are
handled or reported, relevant checks ran (or the reason they could not is stated), changed public behavior, interfaces,
security, build or workflow are documented when needed, and any deferred work is non-blocking and named.

**Burden transfer test** before finalizing: did this make the user do more, the caller know more internals, maintainers
inherit hidden coupling, errors disappear instead of becoming recoverable, or necessary control vanish? If yes, the
change is not DAO-compliant unless the tradeoff is stated.

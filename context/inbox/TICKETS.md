# Tickets

_Local tracker: no tracker MCP is connected in this project yet (`harness.json → tracker.kind = linear`, not authenticated). Same bookkeeping as the tracker: the description is the user's intent and is never rewritten; the harness only appends comments and changes state._

---

## TKT-1 — Project skeleton & first deploy

- **type:** feature · **state:** Done · **created:** 2026-10-05
- **roadmap:** Phase 1 → "Project Skeleton & First Deploy"

**Description**

Empty app, built and deployed by CI on day 1, so the public-link path is proven before any features depend on it.

**Comments**

- 2026-10-05 — `/harness:feature` started; stage 0 (grill) running.
- 2026-10-05 — grill done → `context/inbox/project-skeleton-first-deploy.md`. Decisions: D1 repo `green-api-whatsapp-chat` (public) · D2 lead stages bootstrap, user commits + pushes `main` · D3 lead creates repo / enables Pages via `gh` with per-action OK · D4 live page shows short SHA + build time · D5 `check` = lint+typecheck+vitest+build (Playwright optional) · D6 PR → check, main → deploy, no protection · D7 Node 22 pinned · D8 minimal README · D9 failed deploy keeps previous version.
- 2026-10-05 — Spec: `context/spec/001-project-skeleton-first-deploy/functional-spec.md` → In Progress.
- 2026-10-05 — Stage 2 review (codex): 4 findings, all accepted → `reviews/TRIAGE.md`. Scope addition by user: Conventional Commits, enforced with commitlint + husky + CI (spec §2.6).
- 2026-10-05 — Bootstrap (D2/D3): lead staged 117 files (harness + docs, no app code) and created public repo https://github.com/dustyo-O/green-api-whatsapp-chat (remote `origin`, nothing pushed). User makes the initial commit on `main` and pushes.
- 2026-10-05 — Stage 3 done (tech + 2nd codex review, 5 findings triaged + tasks). Plan:
  - Slice 1: Placeholder page live on GitHub Pages (PR #1)
  - Slice 2: Commit messages enforced locally and on every PR
  - Slice 3: README — run locally in three commands
  - Slice 4: Feature Testing & Regression (PR #2 = slices 2–4)
  - Slice 5: Delivery guarantees proven on the live site
- 2026-10-05 — PR #1 (slice 1): https://github.com/dustyo-O/green-api-whatsapp-chat/pull/1 → **In Review**. `check` green, `deploy` skipped on PR.
- 2026-10-05 — PR #1 merged (`fd68c39`); site live at https://dustyo-o.github.io/green-api-whatsapp-chat/ after the deliberate first-deploy failure (§2.4 c3) + Pages enable + rerun. CORS from the live origin: 6/6 PASS (Chromium + WebKit).
- 2026-10-05 — Stages 4–5 done: PR #2 merged (`3fe0e68`, code re-review SHIP); slice 5 live checks all passed (PRs #3–#6, re-run of an old run). Live label `914d84b`. Next: stage 6 `/awos:verify 001`.
- 2026-10-05 — Stage 6 `/awos:verify 001`: 19/19 acceptance criteria verified (screenshots `docs/screenshots/001-*.png`, look-and-feel confirmed by the user); spec + tech → Completed; roadmap item ticked → **Done**.

---

## TKT-2 — Sign-in & session

- **type:** feature · **state:** In Progress · **created:** 2026-10-05
- **roadmap:** Phase 1 → "Sign-In & Session"

**Description**

Credentials login with readiness check (idInstance, apiTokenInstance, API URL derived from idInstance with an override checkbox); only let the user in once the instance can actually receive replies; remembered session across reloads; logout.

**Comments**

- 2026-10-05 — `/harness:feature` started; stage 0 (grill) running. Carried in from spec 001: a wrong apiUrl/idInstance pair surfaces in the browser as `TypeError: Failed to fetch` (CORS-less 403 or unresolvable host), not as an HTTP status.
- 2026-10-05 — grill done → `context/inbox/sign-in-session.md` (all recommended answers; user: avoid overengineering). D1 Russian UI · D2 lands on empty WhatsApp-style layout · D3 3 fields, derived API URL + override · D4 authorized + ready to receive, else stay with reason + "Check again" · D5 one message per instance state · D6 masked token · D7 simple validation · D8 wrong credentials vs can't-reach (combined) · D9 remembered, re-checked on reload · D10 one-click logout · D11 mocks only; one real-instance [User] check.
- 2026-10-05 — Spec: `context/spec/002-sign-in-session/functional-spec.md` → In Progress.
- 2026-10-05 — Stage 3 done (tech + 2 codex reviews triaged, tasks reviewed). Plan:
  - Slice 1: Working sign-in, plain markup (+ real-instance check by the user)
  - Slice 2: WhatsApp Web look
  - Slice 3: Feature Testing & Regression
  - Slice 4: Ship
- 2026-10-06 — Slice 1 done; real-instance check passed (user). Derived API URL matches the console (12-digit idInstance, `7107` host).

---

## TKT-3 — Fast repeated reloads fail the instance check

- **type:** bug · **state:** Backlog · **created:** 2026-10-06 · **related:** TKT-2

**Description**

If i reload very fast, instance eventually fails to confirm (minor).

Context: spec 002 sign-in-session, slice 1 (real-instance check on local dev) · branch feat/TKT-2-sign-in-session
Repro: signed in with a real instance, reload the page several times in quick succession → «Не удалось проверить инстанс. Попробуйте ещё раз.»
Found while: verifying TKT-2
Likely cause: GREEN-API rate limit (~1 req/s per method, 429 with empty body) → mapped to `unknown` (spec 002 tech §2.2, risk 2).

**Comments**

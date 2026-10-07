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

- **type:** feature · **state:** Done · **created:** 2026-10-05
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
- 2026-10-06 — Stage 6 `/awos:verify 002`: 16/16 criteria verified on live `a1488c1` (screenshots `docs/screenshots/002-*.png`; real-instance flow confirmed by the user); spec + tech → Completed; roadmap items ticked → **Done**.

---

## TKT-3 — Fast repeated reloads fail the instance check

- **type:** bug · **state:** Done · **created:** 2026-10-06 · **related:** TKT-2

**Description**

If i reload very fast, instance eventually fails to confirm (minor).

Context: spec 002 sign-in-session, slice 1 (real-instance check on local dev) · branch feat/TKT-2-sign-in-session
Repro: signed in with a real instance, reload the page several times in quick succession → «Не удалось проверить инстанс. Попробуйте ещё раз.»
Found while: verifying TKT-2
Likely cause: GREEN-API rate limit (~1 req/s per method, 429 with empty body) → mapped to `unknown` (spec 002 tech §2.2, risk 2).

**Comments**
- 2026-10-06 — user: small fix in spec 002 slice 2 — on a 429, wait ~1 s and retry once inside the 15 s budget (tech §2.2 amended, task added to slice 2) → In Progress.
- 2026-10-06 — fixed in spec 002 slice 2 (`5653179`): one retry after a 429, inside the 15 s budget. Ships with the TKT-2 PR.
- 2026-10-06 — PR #8: https://github.com/dustyo-O/green-api-whatsapp-chat/pull/8 → In Review → merged (code review: lockfile false positive rejected, URL syntax fixed, storage-failure rejected).
- 2026-10-06 — shipped in PR #8 (`a1488c1`); fast reloads confirmed fine by the user on live → **Done**.

---

## TKT-4 — Chats & sending

- **type:** feature · **state:** In Progress · **created:** 2026-10-06
- **roadmap:** Phase 1 → "Chats & Sending"

**Description**

WhatsApp Web-style chat layout; start a chat by the recipient's phone number; send text messages with sending/sent/failed status and manual retry; chats kept across reloads.

**Comments**

- 2026-10-06 — `/harness:feature` started; stage 0 (grill) running.
- 2026-10-06 — grill done → `context/inbox/chats-sending.md`. D1 «+» opens a number field · D2 country picker (short list + «Другая страна»), national number · D3 no length check · D4 WhatsApp check on chat creation only · D5 +7 formatted, others plain · D6 emoji marks 🕓 ✅ ❗ + «Повторить» · D7 auto-growing textarea ≤ 6 lines · D8 no deleting · D9 kept across reloads, stuck «sending» → failed · D10 real check to the main phone.
- 2026-10-06 — Spec: `context/spec/003-chats-sending/functional-spec.md` → In Progress.
- 2026-10-06 — Stage 3 done (tech + 2 codex reviews triaged, tasks reviewed). Plan:
  - Slice 1: GREEN-API calls proven before any UI (+ the user's curl probe)
  - Slice 2: Start a chat
  - Slice 3: Send messages
  - Slice 4: Feature Testing & Regression
  - Slice 5: Ship
- 2026-10-06 — PR #10: https://github.com/dustyo-O/green-api-whatsapp-chat/pull/10 → In Review → merged after 3 code-review rounds (3 fixes, storage-failure point rejected each time).
- 2026-10-06 — Stage 5 done: PR #10 merged (`6828df2`). Real delivery check (§2.5) **parked**: WhatsApp logged the instance out and now refuses re-linking → TKT-5.

---

## TKT-5 — Need a linkable WhatsApp account for real checks

- **type:** bug · **state:** In Progress · **created:** 2026-10-06 · **related:** TKT-4

**Description**

I can't link device. Whatsapp denies in. let's go futher with development though, because time is ticking

Context: spec 003 chats-sending, slice 5 (real delivery check) · live `6828df2`
Repro: API-sent first message to a new contact → ✅ (accepted), ✓✓ on sender, no chat on recipient; then the instance got logged out by WhatsApp; re-linking is refused.
Found while: verifying TKT-4
Impact: §2.5 of spec 003, the Receiving Replies real checks, and the demo all need a working instance (likely a spare number). App behaviour is per spec; not a code defect.

**Comments**
- 2026-10-07 — user: "meantime instance is online. messages delivering to real wa account". Unblocks the parked real checks (spec 003 §2.5, spec 004 §2.5). → In Progress.

---

## TKT-6 — Receiving replies

- **type:** feature · **state:** In Progress · **created:** 2026-10-06
- **roadmap:** Phase 1 → "Receiving Replies"

**Description**

Incoming text messages appear in the right chat within 10 seconds; a text from an unknown number creates a new chat; non-text and group events are skipped without blocking the queue; every reply appears exactly once, in order.

**Comments**

- 2026-10-06 — `/harness:feature` started; stage 0 (grill) running. Real checks depend on TKT-5 (a linkable WhatsApp account).
- 2026-10-06 — grill done → `context/inbox/receiving-replies.md` (all recommended). D1 left white bubbles · D2 unread badge · D3 ignore instance-phone messages · D4 placeholder for non-text, groups skipped · D5 match by number, else @lid chat titled by WhatsApp name / «Неизвестный номер» · D6 backlog after sign-in with original times · D7 no sound/notifications.
- 2026-10-06 — Spec: `context/spec/004-receiving-replies/functional-spec.md` → In Progress.
- 2026-10-06 — Stage 3 done (tech + 2 codex reviews triaged, tasks reviewed). Plan:
  - Slice 1: Receive pipeline, no UI (+ optional curl read of the real queue)
  - Slice 2: Replies in the UI
  - Slice 3: Feature Testing & Regression
  - Slice 4: Ship (real reply check waits on TKT-5)

---

## TKT-7 — Same-second replies can order chats wrongly

- **type:** bug · **state:** Backlog · **created:** 2026-10-07 · **related:** TKT-6

**Description**

ticket the same-second chat ordering issue

Context: spec 004 receiving-replies, slice 2 (verify) · branch feat/TKT-6-receiving-replies
Repro: two replies in different chats with the same GREEN-API `timestamp` (whole seconds) → `sortChats` breaks the tie by chat age, so the chat that got the later reply can end up below the other.
Found while: verifying TKT-6
Not a spec failure (functional §2.2 orders by latest message time; equal times are unspecified). Possible fix: break ties by arrival order.

**Comments**
- 2026-10-07 — PR #12: https://github.com/dustyo-O/green-api-whatsapp-chat/pull/12 → In Review → merged after 4 code-review rounds (6 fixes; the last round resolved by the user as a spec change). Real reply check parked on TKT-5.

---

## TKT-8 — Connection & authorization states

- **type:** feature · **state:** In Progress · **created:** 2026-10-07
- **roadmap:** Phase 2 → "Connection & Authorization States"

**Description**

Connection-lost banner with auto-recovery (chats and the unsent draft kept, sending paused, receiving resumes by itself); instance-lost-authorization handling (say so and point to the GREEN-API console).

**Comments**

- 2026-10-07 — `/harness:feature` started; stage 0 (grill) running. Carried in: the instance was logged out by WhatsApp while signed in and sends still showed ✅ (queued by GREEN-API for 24 h), spec 003 slice 5; `stateInstanceChanged` arrives in the receive queue (spec 004 slice 1 probe); a receive answer without `receiptId` can block receiving (spec 004 review 3 F4); a rotated token makes every call 401.
- 2026-10-07 — grill done → `context/inbox/connection-auth-states.md` (all recommended). D1 offline banner (browser offline or 2 network failures) · D2 sending paused, draft kept · D3 logged-out red banner from the queue notification (+5 min fallback if needed) · D4 token-invalid banner with «Выйти» · D5 grey "receiving stuck" after 1 min · D6 one banner by priority.
- 2026-10-07 — Spec: `context/spec/005-connection-auth-states/functional-spec.md` → In Progress.
- 2026-10-07 — Stage 3 done (tech + 2 codex reviews triaged, tasks reviewed). Plan:
  - Slice 1: Status store, response mapping and the banner (+ the user's logged-out / wrong-key probe)
  - Slice 2: State watch and sending paused
  - Slice 3: Feature Testing & Regression
  - Slice 4: Ship

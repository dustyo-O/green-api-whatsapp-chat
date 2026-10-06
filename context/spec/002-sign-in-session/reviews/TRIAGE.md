# Triage — spec 002 sign-in-session

## spec-codex-20261005-2051.md (codex · effort low) — verdict: SHIP WITH FIXES

| # | severity | verdict | rationale | applied in |
|---|---|---|---|---|
| F1 | major | accepted | Missing state: unexpected answers and no answer. Minimal fix: one catch-all message, a 15 s limit, input kept, «Проверить снова». | §2.2 table + criterion |
| F2 | major | deferred: roadmap Phase 2 "One Active Tab → Logout Everywhere" | The race needs two tabs; in one tab it can't happen (no «Выйти» on the «Проверяем инстанс…» screen). Cross-tab logout is its own roadmap item. | §3 Out-of-Scope |
| F3 | minor | accepted in part; rejected: save-failure message | Unreadable saved data → empty form (one line). A "not remembered" message is rejected: all target browsers allow saving, including Safari private mode, and the user asked to avoid overengineering (2026-10-05). | §2.4; §3 Out-of-Scope |
| F4 | minor | accepted (minimal) | A complete https address, trailing `/` ignored, derived URL empty until 4 digits (architecture §4). No path/query rules. | §2.1 requirement + criterion |

## spec-codex-20261005-2100.md (codex · effort low · functional + technical) — verdict: SHIP WITH FIXES

| # | severity | verdict | rationale | applied in |
|---|---|---|---|---|
| F1 | major | accepted (minimal) | A fragment or query in the API URL would swallow the API path. The URL is now scheme + host (+ port) only, matching every GREEN-API console value; no base paths. | functional §2.1; tech §2.4 |
| F2 | major | accepted | Docs give `webhookUrl` as a string; missing or non-string → `unknown`. Relax only if the real instance shows `null`. | tech §2.2, risk 1 |
| F3 | major | rejected: already decided in stage 2 | Same issue as stage-2 F3: storage write failures are out of scope (functional §3); all target browsers allow writes; user rule: avoid overengineering. | — |
| F4 | minor | accepted (wording) | Timing: "usually ≤ 5 s on a normal connection, at most 15 s". | functional §2.2 c1 |

## Code review 2026-10-06 — code-codex-20261006-1650.md (codex · effort low · PR #8) — verdict: SHIP WITH FIXES

| # | severity | verdict | rationale | applied in |
|---|---|---|---|---|
| F1 | major | rejected: false positive | `git diff main...HEAD -- package-lock.json` = +396/−3 with zustand, msw and user-event present; PR #8 CI `check` (runs `npm ci`) passed, run 37482688795. The reviewer never saw the lockfile: `second-opinion.sh` excludes `package-lock.json` from its diff (harness gap). | — |
| F2 | minor | accepted | Spec compliance §2.1: `https:example.com` and `https://example.com/base/..` pass because only the parsed URL is checked. Fix: also check the typed text (scheme + host [+ port] + optional `/`), plus regression tests. | tasks.md Slice F1 |

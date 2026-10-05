# Triage — spec 002 sign-in-session

## spec-codex-20261005-2051.md (codex · effort low) — verdict: SHIP WITH FIXES

| # | severity | verdict | rationale | applied in |
|---|---|---|---|---|
| F1 | major | accepted | Missing state: unexpected answers and no answer. Minimal fix: one catch-all message, a 15 s limit, input kept, «Проверить снова». | §2.2 table + criterion |
| F2 | major | deferred: roadmap Phase 2 "One Active Tab → Logout Everywhere" | The race needs two tabs; in one tab it can't happen (no «Выйти» on the «Проверяем инстанс…» screen). Cross-tab logout is its own roadmap item. | §3 Out-of-Scope |
| F3 | minor | accepted in part; rejected: save-failure message | Unreadable saved data → empty form (one line). A "not remembered" message is rejected: all target browsers allow saving, including Safari private mode, and the user asked to avoid overengineering (2026-10-05). | §2.4; §3 Out-of-Scope |
| F4 | minor | accepted (minimal) | A complete https address, trailing  ignored, derived URL empty until 4 digits (architecture §4). No path/query rules. | §2.1 requirement + criterion |

# Triage — spec 003 chats-sending

## spec-codex-20261006-1723.md (codex · effort low) — verdict: DO NOT SHIP

| # | severity | verdict | rationale | applied in |
|---|---|---|---|---|
| F1 | major | rejected (requirement): user decisions D2/D3 (grill Q2, Q9, Q10, 2026-10-06); accepted (doc drift + custom code) | Country picker + national number and no length check were explicit user decisions. product-definition §2.1 and architecture §1 updated to match; the custom code must be digits, at least one. | functional §2.1; product-definition §2.1; architecture §1 |
| F2 | major | rejected (removal): user decision D4 (grill Q3 = b); accepted (document it) | The WhatsApp check stays. Added to product-definition §2.1 and architecture §4's method list; the exact contract and errors go into spec 003 tech, verified in slice 1. | product-definition §2.1; architecture §4 |
| F3 | major | accepted | Missing state: an unknown outcome can't be shown as a confirmed failure (product-definition already names "unknown"). Minimal: ❔ «Статус неизвестен · Повторить» for no answer / dropped connection / reload, plus a confirmation before resending. | functional §2.3, §2.4 |
| F4 | major | accepted | Architecture §2 promises per-chat drafts; kept across switching and reload, cleared on logout. | functional §2.4 |
| F5 | minor | accepted (minimal) | Locking the controls during the check (button «Проверяем…») makes stale results impossible without extra logic. | functional §2.1 |
| F6 | minor | accepted | Empty chats: no preview/time, sorted by creation; no-selection placeholder from spec 002. | functional §2.2 |
| F7 | minor | accepted | ✅ = accepted by GREEN-API, not delivered; arrival on the phone stays the §2.5 check. | functional §2.3 |

## spec-codex-20261006-1733.md (codex · effort low · functional + technical) — verdict: SHIP WITH FIXES

| # | severity | verdict | rationale | applied in |
|---|---|---|---|---|
| F1 | major | accepted (minimal) | A check started before logout and then a fast re-sign-in could add a chat to the wrong instance. The `idInstance` is captured at the start and the result dropped if it changed. | tech §2.6 |
| F2 | major | rejected: decided three times already | Storage write failures are out of scope (spec 002 stage 2 F3, stage 3 F3, code review F1); user rule: avoid overengineering; volumes far below the ~5 MB quota. | — |
| F3 | major | accepted (minimal) | `maxLength={20000}` on the composer keeps text within GREEN-API's limit; one boundary criterion. | functional §2.3; tech §2.6 |
| F4 | major | accepted | Product §1.4 requires an invalid-number message: 400 `Bad phone number` → «Неверный номер. Проверьте код страны и номер.»; the body is confirmed in the slice-1 probe. | functional §2.1; tech §2.2 |
| F5 | minor | accepted | Architecture §2 now lists `unknown` and separates local ms send time from GREEN-API's seconds timestamp. | architecture §2 |
| F6 | minor | accepted | Text sent as typed; trim only tests emptiness. | functional §2.3; tech §2.6 |

## Code review 2026-10-06 — code-codex-20261006-1908.md (codex · effort low · PR #10) — verdict: DO NOT SHIP

| # | severity | verdict | rationale | applied in |
|---|---|---|---|---|
| F1 | major | accepted | Data safety: a failed rehydrate could keep A's chats in memory and persist them under B's key. Cheap: `open()` clears in-memory chats before rehydrating; test A-with-chats → B-unreadable → empty. | tasks.md Slice F2 |
| F2 | major | accepted | Missing state: «Выйти» is outside the locked form, so logout → same-instance sign-in → a late check answer could recreate a chat. A session counter bumped by `open`/`wipe` replaces the `idInstance` comparison; same-instance test. | tasks.md Slice F2 |
| F3 | major | rejected: decided four times already | Storage write failures out of scope (spec 002 stage 2 F3, stage 3 F3, code review F1; spec 003 stage 3 F2); user rule: avoid overengineering; volumes far below ~5 MB. | — |

## Code review 2026-10-06 — code-codex-20261006-1913.md (codex · effort low · PR #10 after Slice F2) — verdict: SHIP WITH FIXES

Review 1's F1 and F2 are fixed (`11b9476`, `2523737`); no findings on them.

| # | severity | verdict | rationale | applied in |
|---|---|---|---|---|
| F1 | major | rejected: decided five times already | Storage write failures out of scope (spec 002 ×3; spec 003 stage 3 F2; PR #10 review 1 F3); user rule: avoid overengineering. | — |
| F2 | minor | accepted | Missing state: «+» closes the form during a check; the old answer could select the old number and close a newer form. The form ignores its own pending answer after unmount; delayed-answer test. | tasks.md Slice F3 |

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

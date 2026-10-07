# Triage — spec 005 connection-auth-states

## spec-codex-20261007-1313.md (codex · effort low) — verdict: DO NOT SHIP

| # | severity | verdict | rationale | applied in |
|---|---|---|---|---|
| F1 | major | accepted | Detection bound: within 5 min (covers the periodic fallback; the queue notification is usually faster); recovery the same way. Mechanism in tech. | functional §2.3 (+ criterion) |
| F2 | major | accepted | Device offline → 3 s; service unreachable while online → 20 s (8 s receive budget + backoff; matches spec 004). | functional §2.2 (+ criterion) |
| F3 | major | accepted (tech stage) | The functional spec can't list HTTP codes. Wrong token on the right host = 401 **with** CORS (spec 002 probe), so the criterion is observable. Response-to-banner mapping in tech; spec fallback: ambiguous failures = no connection. | functional §2.2; tech (next) |
| F4 | major | accepted | «Повторить» paused too; in-flight sends finish honestly (✅ = accepted); overview guarantee narrowed. | functional §1, §2.6 (+ criterion) |
| F5 | major | accepted | Missing state: every non-authorized state uses its spec 002 sign-in text; sending paused; recovers on authorized. | functional §2.3 (+ 2 criteria) |
| F6 | major | accepted | "Receiving works" = empty check, or taken in **and** cleared; persistent delete failures count as stuck. | functional §2.5 (+ criterion) |

## spec-codex-20261007-1502.md (codex · effort low · functional + technical) — verdict: DO NOT SHIP

| # | severity | verdict | rationale | applied in |
|---|---|---|---|---|
| F1 | major | rejected: user decision b (spec 004, 2026-10-07); accepted: wording | Same timing as spec 004: 10 s for the device's own reconnect, 20 s after an upstream cut. Spec 005 §2.2 now says so explicitly. | functional §2.2; tech §2.2 |
| F2 | major | accepted (minimal) | A failed watch check retries every 30 s until success, then back to 4 min; the 5-minute promise holds while GREEN-API can be reached. | tech §2.1; functional §2.3 |
| F3 | minor | accepted | A cancellable 60 s timer from the first qualifying failure, cancelled only by "works" or the session ending. | tech §2.2 |
| F4 | major | accepted | Re-check the pause after `checkWhatsapp` answers, before `addChat`/`select`; the number stays. | tech §2.4 |
| F5 | major | accepted | Probe both logged-out and wrong-key cases; if they overlap, a 4xx on receive triggers one `getStateInstance`: state → auth, 401/403 → key, failure → keep and retry. | tech §3 risk 1 |

## Code review 2026-10-07 — code-codex-20261007-1810.md (codex · effort low · PR #16) — verdict: DO NOT SHIP

| # | severity | verdict | rationale | applied in |
|---|---|---|---|---|
| F1 | major | accepted | Functional §2.5: taken in but never cleared = stuck. With receives succeeding, GREEN-API is reachable, so a network-failed delete starts the **stuck** clock (not "no connection"); test with repeated receives + network-failed deletes. | tasks.md Slice F1 |
| F2 | major | accepted | Functional §2.2's 20 s: the delete budget 15 s → 8 s (same as receive) → worst case 8 + 1 + 8 = 17 s; outage-during-delete test. | tasks.md Slice F1; tech §2.2 |
| F3 | major | accepted | Functional §2.5: when the tie-break confirms an authorized instance but receiving keeps being refused, count it toward the stuck clock; test. | tasks.md Slice F1 |

## Code review 2026-10-07 — code-codex-20261007-1830.md (codex · effort low · PR #16 after Slice F1) — verdict: DO NOT SHIP

Review 1's F1–F3 are fixed (`cc75da6`); no findings on them.

| # | severity | verdict | rationale | applied in |
|---|---|---|---|---|
| F1 | major | accepted (sturdier rule) | Counting failures can't bound detection once backoff is capped (8 + 5 + 8 = 21 s). New rule: `noConnection` when the latest failure is a network one **and** no reachable answer for **15 s** (wall clock), independent of backoff and tie-break; tests during capped backoff and during a tie-break check. | tasks.md Slice F2; tech amendments |
| F2 | major | accepted (real bug) | Any HTTP answer proves GREEN-API is reachable and must clear `noConnection`, or sending stays wrongly paused (§2.2, §2.6); test outage → repeated 503 → offline gone, grey after 60 s, sending allowed. | tasks.md Slice F2 |
| F3 | major | accepted | A receive 401/403 whose tie-break check fails counts toward the stuck clock (§2.5); test > 1 min of 401 → failed check → grey. | tasks.md Slice F2 |

## Code review 2026-10-07 — code-codex-20261007-1839.md (codex · effort low · PR #16 after Slice F2) — verdict: SHIP WITH FIXES

Round 2's F1–F3 are fixed (`6b27f46`); no findings on them.

| # | severity | verdict | rationale | applied in |
|---|---|---|---|---|
| F1 | major | accepted | Functional §2.2's 20 s recovery: a stalled tie-break (15 s) + capped backoff (5 s) + empty poll (5 s) = 25 s. The tie-break budget drops to **8 s** (the 4-min watch keeps its own) → worst case 18 s; recovery test with capped backoff and no `online` event. | tasks.md Slice F3; tech amendments |

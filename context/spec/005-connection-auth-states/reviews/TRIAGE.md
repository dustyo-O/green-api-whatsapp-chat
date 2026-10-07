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

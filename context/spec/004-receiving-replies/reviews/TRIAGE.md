# Triage — spec 004 receiving-replies

## spec-codex-20261006-2258.md (codex · effort low) — verdict: DO NOT SHIP

| # | severity | verdict | rationale | applied in |
|---|---|---|---|---|
| F1 | major | rejected (removal): user decisions D4/D5; accepted (doc drift) | The placeholder bubble and the name title for hidden-number chats were user decisions. product-definition §3.2 and architecture §4 amended to match. | product-definition §3.2; architecture §4 |
| F2 | major | accepted | Hidden senders: same sender → same chat, two senders → two chats, reply-capable. Key = the `@lid` id; the tech consult confirms `sendMessage` to `@lid`. | functional §2.2 (+ criterion); architecture §4 |
| F3 | major | accepted in part; rejected: storage failure | Redelivery (failed delete or a reload between save and delete) → shown once, with a criterion. Storage write failures out of scope (decided six times). | functional §2.4 |
| F4 | major | deferred: roadmap Phase 2 "One Active Tab" | Multi-tab is that roadmap item; the exactly-once promise is limited to one tab until then. | functional §2.4, §3 |
| F5 | major | accepted | Missing state: receiving retries by itself after a dropped connection or 429 and resumes; replies appear within 10 s after reconnect; logout stops it; banners stay Phase 2. | functional §2.4 (+ criterion) |
| F6 | minor | accepted | List order and preview follow the latest message by time (as spec 003); a late old reply gets a badge but doesn't jump. | functional §2.2 (+ criterion) |
| F7 | minor | accepted | 10 s on a normal connection over 5 replies (product §1.4); backlog ≤ 30 s for ≤ 20 replies. | functional §2.1, §2.4 |

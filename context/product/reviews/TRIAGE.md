# Triage — product definition reviews

## product-codex-20261005-1444.md (codex · effort low) — verdict: DO NOT SHIP

| # | severity | verdict | rationale | applied in |
|---|---|---|---|---|
| F1 | major | accepted | User, 2026-10-05: no MAX account, has WhatsApp and knows it better. Recorded as the concrete reason the fallback applies; also goes in the README and email. | header: Messenger decision; §3.3 |
| F2 | major | accepted | User, 2026-10-05: copy WhatsApp Web. Recorded as an explicit deviation from requirement 4, with the reason; also goes in the README. | header: Visual prototype decision; §3.1 |
| F3 | major | accepted | Without an empty webhookUrl and incoming notifications turned on, polling never sees replies, and that is the reviewer's main check. | §2.1 Credentials login; §3.1; §2.2 |
| F4 | major | accepted | An event left in the queue blocks the messages behind it. Product-level rule added; the exact ordering and acknowledgement mechanics go to the first functional spec. | §2.1 Receive; §1.4 No lost or duplicated messages |
| F5 | major | accepted | Missing state (failed send) — accepted by default. | §2.1 Send; §3.1 |
| F6 | major | accepted | Missing state (offline / authorization lost) — accepted by default. | §2.1 Connection and authorization states; §2.2 |
| F7 | major | accepted | Missing state (multiple tabs) — accepted by default. Two pollers on one queue would split the messages between tabs. | §2.1 Single active tab; §3.1; §2.2 |
| F8 | minor | accepted | Unknown sender creates a chat (WhatsApp Web behaviour) so no reply is dropped; numbers normalized. | §2.1 New chat, Receive; §3.1 |
| F9 | minor | accepted in part; rejected: "defer history" | Measurable latency, visual checklist and closed feature list added. Persistence and history were the user's decisions (2026-10-05); kept and named as deliberate extras, with history still a stretch goal. | §1.4 |
| F10 | major | accepted | Brief's required vs optional items mirrored; deployment and demo marked as our own commitments. | §3.3; §1.4 Submission |

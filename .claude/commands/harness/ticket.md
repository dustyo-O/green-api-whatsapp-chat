---
description: Capture a bug or an idea into Linear the way the user does — a short title and a two-line description — but attach the context the user would otherwise lose (spec, slice, branch, repro).
argument-hint: bug|idea <one line>
---

# Ticket — `$ARGUMENTS`

> Ticket ids: `TKT` stands for the project's ticket prefix (`harness.json` → `ticket_prefix`, e.g. `DUS`, `PROJ`). Tracker MCP tool names differ between servers (Linear: `get_issue`/`save_issue`/`create_comment`/`list_issues`; Jira/GitHub: their equivalents) — use whatever the connected tracker MCP exposes; if no tracker MCP is connected, do the same bookkeeping in `context/inbox/TICKETS.md`.

The user files tickets while verifying a feature or when an idea lands. They write **short** tickets on purpose: the ticket is the intent, the spec (later) is the contract. Keep it that way.

1. Work out the context yourself, do not ask: which spec/slice is being verified right now (last `tasks.md` touched, current branch, last `/harness:*` command in this session), the app area, and — for a bug — the exact repro if it happened in front of you (command, curl, screen).
2. Create the issue with the Linear MCP (`save_issue`, team `harness.json → tracker.team`):
   - title: the user's line, tidied to ≤ 80 chars, imperative for bugs ("Route view crashes when the account is deleted elsewhere").
   - description, **≤ 6 lines**:
     ```
     <the user's words, one or two sentences>

     Context: spec 027 account-deletion, slice 4 (device verify) · branch feat/TKT-68-account-deletion
     Repro: <if known, else "not yet reproduced">
     Found while: verifying TKT-68
     ```
   - labels: from `harness.json → tracker.labels` (`bug`, `idea`, `feature` → the workspace's real label names; case matters, check with the tracker's label listing); priority only if the user said so; state: the team's default (Backlog/Todo).
   - for a bug found while verifying a ticket: link it to that ticket (`relations`/"related to"), don't block it unless the user says it blocks.
3. If the bug contradicts a spec's acceptance criterion, add one line to the description: `Spec conflict: functional-spec.md §X says "…"` — that tells `/harness:fix` to amend the spec, not just the code.
4. Print the identifier and URL, one line. Do **not** start working on it — that is the user's call (`/harness:fix TKT-xx` or `/harness:feature TKT-xx`).

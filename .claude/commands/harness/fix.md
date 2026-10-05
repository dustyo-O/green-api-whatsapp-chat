---
description: Fast lane for a bug ticket — no spec: reproduce with a failing test, fix in an isolated lane session, cross-vendor review, PR. Amends the spec if the bug contradicts it.
argument-hint: TKT-<n>
---

# Fix — `$ARGUMENTS`

> Ticket ids: `TKT` stands for the project's ticket prefix (`harness.json` → `ticket_prefix`, e.g. `DUS`, `PROJ`). Tracker MCP tool names differ between servers (Linear: `get_issue`/`save_issue`/`create_comment`/`list_issues`; Jira/GitHub: their equivalents) — use whatever the connected tracker MCP exposes; if no tracker MCP is connected, do the same bookkeeping in `context/inbox/TICKETS.md`.

Bugs do not get a spec; they get a failing test. But the spec is still the contract: if the bug shows the spec was wrong or silent, the spec changes in the same PR.

1. **Read the ticket** (Linear MCP `get_issue`). Read the spec it points to (`Context:` line) — or find it: grep `context/spec/*/functional-spec.md` for the feature. Restate the bug in one sentence with the expected behaviour **quoted from the spec** ("§3.2: 'the phone lands on sign-in without a dialog'"). If the spec is silent, say so — that is a spec gap and step 4 applies.
2. **Branch**: `fix/TKT-<n>-<slug>` from `main`. Move the ticket to *In Progress* (`save_issue`) and comment: `Working on it — branch fix/TKT-<n>-<slug>` (`save_comment`).
3. **One lane, one session.** Append to the spec's `tasks.md` a slice `- [ ] **Slice F<n>: fix TKT-<n> — <title>**` with sub-tasks tagged `[Agent: …]`: (a) failing test that reproduces the ticket, (b) the fix, (c) gate. Then `/harness:swarm <NNN> --slice F<n>` — it launches exactly that slice and spawns one lane pane, even when earlier slices still have open `[User]` device checks (without `--slice`, the swarm would stop at the first of those). Wait, merge, ledger, as usual.
4. **Spec amendment.** If step 1 found a contradiction or a gap: patch `functional-spec.md` (user-language, no implementation) and add a line to the spec's `## Changelog` (create it if missing): `<date> TKT-<n>: <what changed and why>`. The reviewer sees the spec diff too.
5. **Review**: `/harness:review-code <NNN> main`. Triage as always.
6. **PR**: `gh pr create` — title `TKT-<n>: <ticket title>`, body: repro test name, root cause in two lines, spec amendment if any, link to `reviews/`. Comment the PR URL on the ticket; move it to *In Review*. Merging auto-closes it (branch name carries the id).
Stop. Do not chain into another ticket.

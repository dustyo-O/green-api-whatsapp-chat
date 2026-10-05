---
description: Run the whole pipeline for one feature: grill → spec → cross-vendor review → tech → tasks → swarm → cross-vendor review → verify. Pauses at every gate.
argument-hint: <feature idea | TKT-<n>>
---

# Feature pipeline — `$ARGUMENTS`

> Ticket ids: `TKT` stands for the project's ticket prefix (`harness.json` → `ticket_prefix`, e.g. `DUS`, `PROJ`). Tracker MCP tool names differ between servers (Linear: `get_issue`/`save_issue`/`create_comment`/`list_issues`; Jira/GitHub: their equivalents) — use whatever the connected tracker MCP exposes; if no tracker MCP is connected, do the same bookkeeping in `context/inbox/TICKETS.md`.

You are the orchestrator. Run the stages below **in order**, and after each one print a one-paragraph gate summary and **wait for the user's go** before the next. Never merge two stages into one to save time — the pauses are the product.

| # | Do | Gate: continue only if |
|---|---|---|
| 0 | `/harness:grill $ARGUMENTS` | user says the decisions are right |
| 1 | `/awos:spec <inbox file>` | spec written, user has read it |
| 2 | `/harness:review-spec <NNN>` | no un-triaged blockers |
| 3 | `/awos:tech`, then **`/harness:review-spec <NNN>` again** — the reviewer reads the technical considerations now that they exist (the stage-2 pass could not) — then `/awos:tasks` | tech findings triaged; every sub-task has `[Agent: …]` or `[User]`; slice 1 holds the riskiest unknown |
| 4 | `/harness:swarm <NNN>` — repeat per slice, human steps in between | all slices done or explicitly parked |
| 5 | `/harness:review-code <NNN>` | gates green after fixes |
| 6 | `/awos:verify <NNN>` | Status: Completed |

Ticket protocol (when the idea is, or has, a `TKT-<n>`): the ticket's description is never rewritten — it is the user's intent. The harness only *comments* and *moves* it:
- after stage 1: comment `Spec: context/spec/<NNN>-<slug>/functional-spec.md` → *In Progress*
- after stage 3: comment the slice titles (one line each) so the ticket shows the plan without the detail
- before stage 5: `gh pr create` (title from the spec, ticket in the branch name, body links `tasks.md` + `reviews/`), comment the PR URL → *In Review*
- stage 6 done: merging auto-closes it; if more PRs follow, reopen with a comment saying which slice is next.
If the idea has no ticket, create one first with `/harness:ticket idea <one line>` so the branch has an id.

If any stage fails its gate twice, stop and summarise what is blocking — do not loop.

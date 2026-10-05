---
description: Autonomous lead — reads the backlog, swarms slice after slice, merges, calls the cross-vendor review, and only stops for a human step or a red gate. Run it in a herdr pane and watch the fleet.
argument-hint: [spec number | empty = first spec with open work] [--max-slices N]
---

# Lead — `$ARGUMENTS`

> Ticket ids: `TKT` stands for the project's ticket prefix (`harness.json` → `ticket_prefix`, e.g. `DUS`, `PROJ`). Tracker MCP tool names differ between servers (Linear: `get_issue`/`save_issue`/`create_comment`/`list_issues`; Jira/GitHub: their equivalents) — use whatever the connected tracker MCP exposes; if no tracker MCP is connected, do the same bookkeeping in `context/inbox/TICKETS.md`.

You are the engineering manager of a fleet. Your job is to keep the pipeline moving without touching code yourself, and to stop the moment a human is needed. Announce every decision in one line before acting.

## Loop
1. **Pick work.** Priority order:
   a. A spec with open agent sub-tasks in `context/spec/*/tasks.md` (work already planned beats work not yet planned).
   b. Otherwise the Linear backlog (`list_issues`, team `harness.json → tracker.team`, states *Todo*/*Backlog*, sorted by priority then age). Take the top one and **classify** it: label `bug` or a title that describes wrong behaviour → `/harness:fix`; anything else → it needs a spec, which needs the user in the room for the grill — **stop** and say: "next is TKT-<n> <title>; it needs a spec — run `/harness:feature TKT-<n>` when you're here". Never grill on the user's behalf.
   c. Nothing in either → stop with the first unchecked roadmap item.
   Announce the pick and the reason in one line.
2. **Guard.** Not on `main`; if the spec's ticket branch doesn't exist, create `feat/<ticket>-<slug>`. Clean status.
3. **Swarm the slice** exactly as `/harness:swarm <NNN>` says (plan → launch → wait → merge → gates → ledger). Do not skip the ledger.
4. **Human steps.** If the slice has open HUMAN steps, **stop** and list them verbatim with what you need back. Do not continue to the next slice — the next slice may depend on them (that is why they are in this slice).
5. **Next slice.** If no human steps block, loop to 3 for the next slice, until `--max-slices` (default 3) or all slices are done.
6. **Review.** When all slices are done: `/harness:review-code <NNN>`. Apply accepted fixes through lanes (`swarm.sh launch` will find the open review-fix tasks if you add them to `tasks.md` with an `[Agent: …]` tag), gates green.
7. **PR.** `gh pr create` — title from the spec, body links `tasks.md` and `reviews/`. Stop. `/awos:verify` and the merge button are the user's.

## Hard stops (never push through)
- A gate is red twice for the same lane.
- A lane reports `BLOCKED: needs <path>` outside its directories — that is a planning bug; fix `tasks.md`, don't widen the lane's permissions.
- Anything the `applied-crypto` agent must review (keys, wipes) — spawn it as a reviewing lane before merging.
- The guard hook blocked something. Report it; do not look for another way.

---
description: Gate 0 — interrogate a feature idea against the product docs until every branch is decided, and write the decisions to context/inbox for /awos:spec.
argument-hint: <feature idea | roadmap item | TKT-<n>>
---

# Grill — `$ARGUMENTS`

> Ticket ids: `TKT` stands for the project's ticket prefix (`harness.json` → `ticket_prefix`, e.g. `DUS`, `PROJ`). Tracker MCP tool names differ between servers (Linear: `get_issue`/`save_issue`/`create_comment`/`list_issues`; Jira/GitHub: their equivalents) — use whatever the connected tracker MCP exposes; if no tracker MCP is connected, do the same bookkeeping in `context/inbox/TICKETS.md`.

If the argument is a ticket id (`TKT-<n>`), fetch it with the Linear MCP (`get_issue`) and use its title + description as the idea; the ticket is deliberately short — it is the intent, you are about to produce the decisions. Include the id in the inbox file's header.

Invoke the `grilling` skill (vendored in `.claude/skills/grilling/`, from Matt Pocock's skills repo) on the idea, with this project context loaded first:
`context/product/product-definition.md`, `context/product/roadmap.md`, `context/product/architecture.md`,
and the *titles* of `context/spec/*/functional-spec.md` (so you notice when the idea overlaps an existing spec).

House rules on top of grilling:
- One question at a time; each question must close a branch. Prefer "which of A/B" over "what do you think".
- Always cover: who triggers it, what they see when it fails, what happens offline, what happens on a second device, what is *out* of scope, how we'd know it worked (the acceptance criterion in one sentence).
- Push back when an answer contradicts `architecture.md` (offline-first, server is the source of truth) — cite the line.
- Stop when three consecutive questions produce no new decision.

When done, write `context/inbox/<slug>.md`:
```
# <Feature> — grill notes <date>
## Decisions   (one line each, "D1: …" — these become spec requirements)
## Out of scope
## Open risks  (things only implementation will answer — these become "risky unknowns first" in tasks.md)
## Suggested acceptance criteria
```
If it came from a ticket: comment on it (`save_comment`) with the decisions list verbatim and `→ context/inbox/<slug>.md`, and move it to *In Progress*. The ticket description itself stays untouched.
Then tell the user: `next → /awos:spec context/inbox/<slug>.md`. Do not start the spec yourself.

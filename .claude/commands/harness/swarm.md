---
description: Gate 4 — implement a spec's open slice with parallel REAL claude sessions (one per lane, own worktree, own herdr pane), then wait, merge, run gates, keep the ledger.
argument-hint: <spec number> [--slice F<n>] [--dry-run]
---

# Swarm — `$ARGUMENTS`

You are the lead. **You do not write code.** You spawn sibling sessions, wait for them, merge, and keep the ledger.
The siblings are not subagents — they are full `claude` sessions in their own worktrees and their own herdr panes. You can see them; so can the user.

## Step 0 — plan
```
bin/harness/swarm.sh launch <NNN> --dry-run
```
If `$ARGUMENTS` carries `--slice F<n>` (a `/harness:fix` slice), pass it to every `launch` below: a fix slice is launched directly, out of order. Numbered slices are always sequential.
Show the plan: lanes, agents, owned directories, and the HUMAN steps. Slices are sequential; lanes are parallel.
If two lanes will obviously touch the same directory (read the task text), merge them by adding an explicit `**[Lane: shared]**` tag to those sub-tasks in `tasks.md` and re-plan. A collision costs more than the parallelism saves.
If `--dry-run` was asked: stop here.

## Step 1 — prerequisites
- `git status` clean; you are on a feature branch, not `main` (the script refuses `main`).
- If a HUMAN step must happen *before* the agent work (an infra apply, a credential), ask the user now.

## Step 2 — launch
```
bin/harness/swarm.sh launch <NNN>
```
Tell the user which panes appeared (`<NNN> <lane>` labels) and that they can watch or type into any pane; a pane showing **blocked** is waiting for a permission answer — the user answers it in the pane, not here.

## Step 3 — wait
```
bin/harness/swarm.sh wait <NNN>
```
This blocks until every lane reports `done` (or times out). Do nothing else meanwhile. When it returns, read `== lane reports` — each lane's `LANE <name>: DONE|PARTIAL|BLOCKED` block. Use `bin/harness/swarm.sh status <NNN>` if you need a mid-flight look.

## Step 4 — merge
```
bin/harness/swarm.sh merge <NNN>
```
Merges lane branches `--no-ff` in plan order and stops on the first conflict. Resolve **towards the spec**, not towards whichever lane wrote last; if unsure, ask. Then run every lane gate (`harness.json → lanes.<agent>.gate`) any lane touched, on the merged tree. Not green → revert the merge commit, send the failure back to that lane's pane with `herdr pane send_text <pane> "<the failure>"` (the session still has its context), wait again.

## Step 5 — ledger
For every task a lane reported `done`: tick it in `tasks.md`, append `_(Done <date>: <the lane's ledger note>)_`. `blocked`/`partial` stay open with `_(Blocked <date>: …)_`.
`bin/harness/swarm.sh clean <NNN>` closes the lane panes and removes the worktrees; branches stay until the PR merges. If a pane is still needed (you want to read it, or send a failure back), do the clean after that.

## Step 6 — report, verbatim, and stop
The lane panes close on clean; **your message is the only place the user sees what the lanes said.** Quote each lane's `LANE <name>: …` block in full (from `lanes/logs/`), then per lane: commits (`git log --oneline` of the lane branch), gate result. Then the slice's HUMAN steps still open, quoted from `tasks.md`, and the next slice's title. Stop — the next slice is a new `/harness:swarm`, after the human steps.

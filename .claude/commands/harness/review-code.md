---
description: Gate 5 — cross-vendor review of the implementation diff for a spec, triage with verdicts, fix, re-run gates.
argument-hint: <spec number> [base-ref, default main]
---

# Second opinion on the code — `$ARGUMENTS`

You are the lead. The domain agents wrote this code under your direction; you do **not** review it yourself.

## Step 1 — run the reviewer
```
bin/harness/second-opinion.sh code <NNN> [base]
```
Pass the base the lanes were merged onto (default `main`). Warn the user if the script reports a same-vendor fallback.

## Step 2 — triage
Append to `context/spec/<NNN>-*/reviews/TRIAGE.md` (same table as the spec triage, new section `## Code review <date>`).
- Any finding under **data safety** or **spec compliance** with severity ≥ major is `accepted` unless the user overrules it in this session.
- Style/nit findings may be batched into one `deferred` line if the gates are green and the user agrees.

## Step 2b — quote first; wait only when a decision is the user's
**Before touching any file**, print every finding **verbatim** (title, severity, where, problem, evidence, fix — copied from the review file, not summarised), each followed by your verdict line (`→ accepted` / `→ rejected: <why>` / `→ deferred: <ticket>` / `→ YOUR CALL: <options and what each costs>`), then the reviewer's `## Verdict` line quoted. The reviewer pane is gone by then; this message is the only place the user sees the review, and it is how they track why a change happened. Then: if **every** verdict is `accepted` / `rejected` / `deferred` with a reason a stranger could check, **continue straight to apply** — do not wait. If any finding is `YOUR CALL`, or a blocker would be rejected, **stop after the quotes and wait for the user's answer** before applying anything. (User's rule, 2026-09-20: quote always, pause only for decisions.)

## Step 3 — fix
Delegate each accepted fix to the domain agent named in the task's `[Agent: …]` tag (use the Agent tool, not your own hands, unless it is a one-line change). After fixes: run the relevant gate(s) (`harness.json → lanes.<agent>.gate`). Green or it is not fixed.

## Step 4 — ledger
For every fix, append to the matching sub-task in `tasks.md`: `_(Review fix <date>: F<n> — what changed)_`.

## Step 5 — report, verbatim
The reviewer pane is gone by now; **your message is the only place the user sees the review.** Quote, don't summarise: the review file path; every finding in full with your triage line after it (`→ accepted (fixed in <commit>)` / `→ rejected: <why>` / `→ deferred: <ticket>` / `→ YOUR CALL: …`); the reviewer's `## Verdict` line; gate results; open questions numbered with finding ids.
Stop; `/awos:verify` is the user's call.

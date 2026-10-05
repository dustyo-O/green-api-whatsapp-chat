---
description: Gate 2 — cross-vendor review of a spec (Codex by default), then triage every finding with a written verdict and patch the spec.
argument-hint: <spec number, e.g. 027> [--effort low|medium|high]
---

# Second opinion on the spec — `$ARGUMENTS`

You are the lead. You wrote (or own) this spec, so you do **not** review it yourself. Another vendor does; you triage.

## Step 1 — run the reviewer
Commit the spec first (`git add context/spec/<NNN>-* && git commit`) so Step 4's diff is a real `git diff`, not a memory.
```
HARNESS_REVIEW_EFFORT=${effort:-low} bin/harness/second-opinion.sh spec <NNN>
```
Read stderr: if it says it fell back to the same vendor, tell the user before continuing — the signal is weaker.
Read the produced review file in full.

## Step 2 — triage, in writing
Create/append `context/spec/<NNN>-*/reviews/TRIAGE.md` with a table:

| # | severity | verdict | rationale | applied in |
|---|---|---|---|---|

Verdict is one of `accepted`, `rejected: <why>`, `deferred: <ticket or 'next spec'>`.
Rules of triage:
- A `blocker` cannot be `rejected` without asking the user. Show it, ask, record the answer.
- Reject only with a reason a stranger could check ("spec §3.2 already covers this", "contradicts architecture.md: offline-first").
- Anything about a **missing state** (empty/error/offline/multi-device) defaults to `accepted` — those are the bugs that ship.

## Step 2b — quote first; wait only when a decision is the user's
**Before touching any file**, print every finding **verbatim** (title, severity, where, problem, evidence, fix — copied from the review file, not summarised), each followed by your verdict line (`→ accepted` / `→ rejected: <why>` / `→ deferred: <ticket>` / `→ YOUR CALL: <options and what each costs>`), then the reviewer's `## Verdict` line quoted. The reviewer pane is gone by then; this message is the only place the user sees the review, and it is how they track why a change happened. Then: if **every** verdict is `accepted` / `rejected` / `deferred` with a reason a stranger could check, **continue straight to apply** — do not wait. If any finding is `YOUR CALL`, or a blocker would be rejected, **stop after the quotes and wait for the user's answer** before applying anything. (User's rule, 2026-09-20: quote always, pause only for decisions.)

## Step 3 — apply
Patch `functional-spec.md` / `technical-considerations.md` for every `accepted` item. Keep the spec's language rules (no implementation talk in the functional spec). Fill the `applied in` column with the section you changed.

## Step 4 — report, verbatim
The reviewer pane is gone by now; **your message is the only place the user sees the review.** Do not summarise findings — quote them.
1. First line: the review file path and the reviewer/effort used.
2. Then **every finding in full**, copied from the file (title, severity, where, problem, evidence, fix), each followed by your triage line: `→ accepted` / `→ rejected: <why>` / `→ deferred: <ticket>` / `→ YOUR CALL: <what the choice is and what each option costs>`.
3. Then the reviewer's `## Verdict` line, quoted.
4. Then the diff of the spec changes you applied (`git diff` of the spec files, in a code block).
5. Then the questions you need answered, numbered, each with the finding id it comes from.
Stop. The user decides whether to proceed to `/awos:tech`.

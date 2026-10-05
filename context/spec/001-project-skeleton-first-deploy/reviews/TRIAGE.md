# Triage — spec 001 project-skeleton-first-deploy

## spec-codex-20261005-1707.md (codex · effort low) — verdict: SHIP WITH FIXES

| # | severity | verdict | rationale | applied in |
|---|---|---|---|---|
| F1 | major | accepted | architecture.md §3 promises the CORS check from `*.github.io` on day 1, and the spec didn't carry it. The functional spec's language rules keep request-level detail out, so the spec gets a plain-language in-scope line and the concrete check (a request from the live origin, preflight included, run from the browser console on the deployed page, no app code) goes into technical-considerations.md as a `[Lead]` verification step. | functional-spec.md §3 In-Scope; technical-considerations.md (stage 3) |
| F2 | major | accepted | Missing state (a main-branch change that fails its checks) is accepted by default. Publishing must depend on passing checks for the same change. | §2.2 requirement; §2.4 requirement + new criterion; §3 In-Scope |
| F3 | minor | accepted | "within 10 minutes" also covered opening immediately; now "10 minutes or more after acceptance", limited to changes that passed their checks, so it no longer contradicts §2.4. | §2.2 criterion 1 |
| F4 | major | accepted | Missing state (overlapping runs) is accepted by default. The page must never go back to an older version; checked with two merges less than a minute apart. | §2.2 new requirement + criterion 3; §3 In-Scope |

## spec-codex-20261005-1750.md (codex · effort low · functional + technical) — verdict: DO NOT SHIP

| # | severity | verdict | rationale | applied in |
|---|---|---|---|---|
| F1 | major | accepted | A manual re-run of an older `main` run would republish an old SHA, and nothing stopped it. A tip guard in `deploy` (publish only if `GITHUB_SHA` is still the tip of `main`) closes this and also covers runs starting in an unexpected order. | functional §2.2 requirement + criterion c4; tech §2.7 tip guard, §4 table |
| F2 | major | accepted with user decision (a), 2026-10-05 | The Q3 bootstrap failure has no previous page, so it proves c3 only. c2 is accepted by design (Pages switches deployments atomically) together with §2.4 c1 (red run → label unchanged, observed). No deploy failure is provoked after the baseline. | tech §4 table (§2.4 c2 / c3 split), Decisions Q3 |
| F3 | major | accepted | "Every accepted change visible after 10 min" contradicted superseded changes; and the cache lifetime starts when the page is cached, not when the change is accepted. Freshness now applies to the latest change only, measured from its run finishing, with normal navigation. | functional §2.2 requirement + c1; tech §2.4, risk 8, §4 table |
| F4 | minor | accepted | `engines ^22.22.2` contradicted "Node.js 22"; the "still works" claim was unproven. | functional §2.5 requirement + c1/c3; tech risk 7, §4 table |
| F5 | minor | accepted | §2.6 promised refusal everywhere, while the design leaves squash titles and `main` pushes unchecked (Q2). The enforcement boundary and exception are now stated. | functional §2.6 requirement + c2, §3 In-Scope; tech §2.6 |

## Code review 2026-10-05 — code-codex-20261005-1808.md (codex · effort low · PR #1 = slice 1) — verdict: DO NOT SHIP

The reviewer saw the whole spec but only the slice-1 diff: `second-opinion.sh code` gives it no slice scope (harness gap). Both findings are later slices of the two-PR plan.

| # | severity | verdict | rationale | applied in |
|---|---|---|---|---|
| F1 | major | deferred: Slice 2 (PR #2) | Commit-message enforcement is tasks.md Slice 2. PR #1 is slice 1 only by design (tasks.md header: two PRs). Re-reviewed with PR #2. | — |
| F2 | major | deferred: Slice 3 (PR #2) | The README is tasks.md Slice 3, under the same plan. Re-reviewed with PR #2. | — |

## Code review 2026-10-05 — code-codex-20261005-1937.md (codex · effort low · PR #2 = slices 2–4) — verdict: SHIP WITH FIXES

| # | severity | verdict | rationale | applied in |
|---|---|---|---|---|
| F1 | major | accepted | Spec compliance (§2.2): an older re-run can replace the pending tip run; the tip guard then skips everywhere and the tip never deploys. Fix: a native queueing setting if GitHub has one, else a self-healing dispatch from the superseded path; plus three-run scenario tests. | tasks.md Slice F1; functional §2.2 (clarified) |
| F2 | minor | accepted in part; rejected: required scope | Ignores: accepted. Default ignores pass `fixup!`/`squash!`/`Revert "…"` messages that would reach `main` via merge commits, so ignores are limited to merge messages. Required scope: rejected, because CLAUDE.md → Commits (user-approved) says "Omit it when nothing fits" and existing commits (`ci: …`, `docs: …`, the user's `chore: bootstrap …`) rely on it. Spec §2.6 amended to "optionally the affected part". | tasks.md Slice F1; functional §2.6 |

## Code review 2026-10-05 — code-codex-20261005-1946.md (codex · effort low · PR #2 after Slice F1) — verdict: SHIP

No findings. Static review only.

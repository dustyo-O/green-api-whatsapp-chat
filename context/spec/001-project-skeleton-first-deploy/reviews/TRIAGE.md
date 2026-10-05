# Triage — spec 001 project-skeleton-first-deploy

## spec-codex-20261005-1707.md (codex · effort low) — verdict: SHIP WITH FIXES

| # | severity | verdict | rationale | applied in |
|---|---|---|---|---|
| F1 | major | accepted | architecture.md §3 promises the CORS check from `*.github.io` on day 1, and the spec didn't carry it. The functional spec's language rules keep request-level detail out, so the spec gets a plain-language in-scope line and the concrete check (a request from the live origin, preflight included, run from the browser console on the deployed page, no app code) goes into technical-considerations.md as a `[Lead]` verification step. | functional-spec.md §3 In-Scope; technical-considerations.md (stage 3) |
| F2 | major | accepted | Missing state (a main-branch change that fails its checks) is accepted by default. Publishing must depend on passing checks for the same change. | §2.2 requirement; §2.4 requirement + new criterion; §3 In-Scope |
| F3 | minor | accepted | "within 10 minutes" also covered opening immediately; now "10 minutes or more after acceptance", limited to changes that passed their checks, so it no longer contradicts §2.4. | §2.2 criterion 1 |
| F4 | major | accepted | Missing state (overlapping runs) is accepted by default. The page must never go back to an older version; checked with two merges less than a minute apart. | §2.2 new requirement + criterion 3; §3 In-Scope |

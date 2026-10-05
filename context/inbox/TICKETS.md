# Tickets

_Local tracker: no tracker MCP is connected in this project yet (`harness.json → tracker.kind = linear`, not authenticated). Same bookkeeping as the tracker: the description is the user's intent and is never rewritten; the harness only appends comments and changes state._

---

## TKT-1 — Project skeleton & first deploy

- **type:** feature · **state:** In Progress · **created:** 2026-10-05
- **roadmap:** Phase 1 → "Project Skeleton & First Deploy"

**Description**

Empty app, built and deployed by CI on day 1, so the public-link path is proven before any features depend on it.

**Comments**

- 2026-10-05 — `/harness:feature` started; stage 0 (grill) running.
- 2026-10-05 — grill done → `context/inbox/project-skeleton-first-deploy.md`. Decisions: D1 repo `green-api-whatsapp-chat` (public) · D2 lead stages bootstrap, user commits + pushes `main` · D3 lead creates repo / enables Pages via `gh` with per-action OK · D4 live page shows short SHA + build time · D5 `check` = lint+typecheck+vitest+build (Playwright optional) · D6 PR → check, main → deploy, no protection · D7 Node 22 pinned · D8 minimal README · D9 failed deploy keeps previous version.
- 2026-10-05 — Spec: `context/spec/001-project-skeleton-first-deploy/functional-spec.md` → In Progress.
- 2026-10-05 — Stage 2 review (codex): 4 findings, all accepted → `reviews/TRIAGE.md`. Scope addition by user: Conventional Commits, enforced with commitlint + husky + CI (spec §2.6).
- 2026-10-05 — Bootstrap (D2/D3): lead staged 117 files (harness + docs, no app code) and created public repo https://github.com/dustyo-O/green-api-whatsapp-chat (remote `origin`, nothing pushed). User makes the initial commit on `main` and pushes.

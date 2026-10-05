# Project Skeleton & First Deploy — grill notes 2026-10-05

Ticket: **TKT-1** (context/inbox/TICKETS.md) · Roadmap: Phase 1 → "Project Skeleton & First Deploy"

## Decisions

- D1: Repository is **`green-api-whatsapp-chat`** on GitHub account `dustyo-O`, **public**. Live URL: `https://dustyo-o.github.io/green-api-whatsapp-chat/`.
- D2: Bootstrap of `main`: the lead **stages** the existing harness + `context/` docs (no app code). The **user** makes the initial commit on `main` and pushes it. After that, all work goes through feature branches and PRs; the lead never commits to `main`.
- D3: The lead creates the GitHub repo, adds the remote and sets Pages to "GitHub Actions" using `gh`, asking the user for an explicit OK right before each of these outward-facing actions.
- D4: The deployed page shows the app name, a "skeleton" note, and the **short commit SHA and build time** of the build, so anyone can see that the live site is the latest `main`. (User: "whatever" — low stakes, any equivalent proof of freshness is fine.)
- D5: `npm run check` = lint + typecheck + Vitest (one smoke test) + build. Playwright is not part of the gate in this feature. The user is also fine with installing Playwright now if the implementation needs it (for example for `verify-ui` evidence); that is the implementer's call, as long as CI doesn't download browsers for nothing.
- D6: CI runs `check` on every PR and every push. Only a push to `main` deploys to Pages. No branch protection.
- D7: Node **22 LTS**, pinned in `.nvmrc` and `package.json → engines`; CI uses the same version.
- D8: A minimal README in this feature: one-line description, "Run locally" in ≤ 3 commands, and the live link. The full reviewer README stays in roadmap Phase 3.
- D9: If a deploy fails, the previous version stays live and the failed run is visible in GitHub Actions. Nothing is shown to end users.

## Out of scope

- Login UI, any GREEN-API call, Zustand store, WhatsApp styling (all later Phase 1 specs).
- Playwright as part of the CI gate; e2e tests.
- Any folder structure beyond what the one page needs.
- Branch protection, preview deploys per PR, custom domain.
- Offline and multiple devices: not applicable to a static page with no data.

## Open risks

- **Vite `base` vs Pages path:** a wrong `base` gives a blank live page (assets 404) while local dev works. Only the first real deploy proves it, so it goes first in tasks.md.
- **Enabling Pages through the API:** `gh api` with `build_type=workflow` on a brand-new repo, and the `github-pages` environment being created on the first deploy. The token scopes and order of operations are unverified.
- **Injecting the commit SHA at build time:** it must come from CI (`GITHUB_SHA`) and fall back to something sensible locally (for example `dev`) without breaking `npm run dev`.
- **Bootstrap hand-off:** the PR flow can't start until the user has pushed `main`, so the first feature branch waits on a `[User]` step.

## Suggested acceptance criteria

- After a PR is merged to `main`, the GitHub Actions run is green and `https://dustyo-o.github.io/green-api-whatsapp-chat/` shows the short SHA of that merge commit.
- On a clean clone, `npm ci && npm run dev` serves the same page locally, with a local placeholder instead of a SHA.
- A PR runs `npm run check` (lint, typecheck, test, build) in CI and does not deploy.
- A failing `check` on a PR shows as a red run, and the live site keeps the previous version.
- The README shows how to run it locally in ≤ 3 commands and links the live URL.

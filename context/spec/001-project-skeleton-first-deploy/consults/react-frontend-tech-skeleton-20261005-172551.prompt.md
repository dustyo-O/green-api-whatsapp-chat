You are running as the **`react-frontend`** agent (`claude --agent react-frontend`): your instructions are `.claude/agents/react-frontend.md`; the skills it lists are in `.claude/skills/`. Read `CLAUDE.md` first.
This is a **consultation**, not a lane: answer the questions below in markdown. Read, search and run read-only commands as you need (verify versions and option names — do not guess). Create or edit **no files**, with one exception: when your answer is complete, write it in full to `context/spec/001-project-skeleton-first-deploy/consults/react-frontend-tech-skeleton-20261005-172551.md` with the Write tool (that path is pre-approved), then end your turn with exactly this line:

    CONSULT react-frontend tech-skeleton: DONE

The lead quotes the file verbatim — no preamble, no restating the questions; cite the files and commands you used to verify facts.

---

You are consulted as the `react-frontend` specialist for spec 001 (Project Skeleton & First Deploy). The lead will write `technical-considerations.md` from your answer and quote it verbatim to the user. Do not write any file except your answer file.

## Read first
- `context/spec/001-project-skeleton-first-deploy/functional-spec.md` (the contract: §2.1–§2.7, incl. §2.6 Conventional Commits)
- `context/spec/001-project-skeleton-first-deploy/reviews/TRIAGE.md` (F1: the CORS-from-live-origin check must be a `[Lead]` verification step in the tech spec, no app code)
- `context/product/architecture.md` (stack contract — do not add libraries it does not list without flagging it)
- `CLAUDE.md` → "Commits" section
- `harness.json` (lane `react-frontend`, gate `npm run check`)

There is no application code yet; the repo holds only harness files and docs. Repo: `dustyo-O/green-api-whatsapp-chat` (public). Live URL: `https://dustyo-o.github.io/green-api-whatsapp-chat/`. Local Node is v22.23.

## Answer these, concretely (contracts and file paths, not full file contents)

1. **Versions.** Check current stable versions with `npm view <pkg> version` for: react, react-dom, vite, @vitejs/plugin-react, typescript, vitest, @testing-library/react, @testing-library/jest-dom, jsdom, eslint, typescript-eslint, eslint-plugin-react-hooks, prettier, husky, @commitlint/cli, @commitlint/config-conventional. Flag any peer-dependency conflicts you foresee (e.g. React 19 vs RTL, ESLint 9 flat config vs plugins).
2. **File layout** for the skeleton: every file to create, one line of responsibility each. Keep it to what the page needs (architecture: no router, CSS Modules, strict TS).
3. **Version label (§2.1, §2.5).** How the short SHA and build time get into the page at build time and fall back to "local" in dev — mechanism, the names of the constants, where the short SHA comes from in CI, and how it is typed. Build time format shown to the visitor.
4. **Base path and trailing slash (§2.1 criterion 3).** Vite `base` value; does GitHub Pages itself redirect `/green-api-whatsapp-chat` → `/green-api-whatsapp-chat/`? If you can't verify, say so and propose how the lead verifies it after the first deploy.
5. **npm scripts.** The exact script names and what each runs: dev, build, preview, lint, typecheck, test, format check, commitlint, `check` (the lane gate — must equal what CI runs). `.nvmrc` + `engines` and what npm actually does on a different major (§2.5 criterion 3 says "warning").
6. **Commit linting (§2.6).** commitlint config file, husky v9 setup (`prepare` script, `.husky/commit-msg`), how husky is kept from breaking `npm ci` in CI and for reviewers who download a zip without `.git`. CI step that lints every commit of a PR (range, `fetch-depth`), and what is linted on a push to `main`.
7. **CI/CD workflow(s).** File name(s), triggers, jobs and their order: `check` on every PR and push; `deploy` only on push to `main`, only after `check` passes for the same commit (F2); permissions; the Pages actions used; the concurrency setting that guarantees an older run can never publish over a newer one (F4) — explain why your setting guarantees it. Node version source in CI (.nvmrc).
8. **Enabling Pages.** The exact `gh api` call to set the Pages source to "GitHub Actions" for a new repo, and whether it must happen before or after the first workflow run.
9. **CORS verification (F1).** A `[Lead]` step: what to run in the browser console on the live page to prove a GREEN-API request from `https://dustyo-o.github.io` is not blocked, including a request that triggers a preflight (POST with JSON). Use a fake instance id/token — no real credentials. What output counts as pass vs fail.
10. **Tests.** The one Vitest smoke test (what it asserts), test environment config, and which functional-spec criteria are verified by automated test vs. by a manual/lead check (map every §2.x criterion).
11. **Risks**, ordered riskiest first, each with a mitigation — the lead will put the riskiest unknown into slice 1.

Format: one `##` section per question above, terse bullets. End with `## Open questions for the lead` (empty if none).

<!--
This document describes HOW to build the feature at an architectural level.
It is NOT a copy-paste implementation guide.
-->

# Technical Specification: Project Skeleton & First Deploy

- **Functional Specification:** [functional-spec.md](functional-spec.md)
- **Status:** Draft
- **Author(s):** Alexander Shleyko (lead) · `react-frontend` consult: [consults/react-frontend-tech-skeleton-20261005-172551.md](consults/react-frontend-tech-skeleton-20261005-172551.md). The consult prototyped this setup and ran the full gate green on 2026-10-05; its verification evidence lives there.

---

## 1. High-Level Technical Approach

A Vite 8 + React 19 + strict TypeScript SPA with exactly one page. The short commit SHA and build time are injected at build time from `GITHUB_SHA`; locally the page shows `local`. A single GitHub Actions workflow (`ci.yml`) has three jobs:

- `commitlint`: lints the PR's commits.
- `check`: runs the same `npm run check` that the lane gate runs, then uploads `dist` as the Pages artifact (on `main` only).
- `deploy`: publishes that exact artifact to GitHub Pages, only after `check` passed for the same commit.

Workflow-level concurrency serializes `main` runs so an older run can never publish over a newer one. Conventional Commits are enforced by commitlint through a husky `commit-msg` hook locally and by the `commitlint` job in CI. Pages is switched to the "GitHub Actions" source with one `gh api` call, made with the user's OK (D3).

No runtime dependencies beyond `react` and `react-dom`. No router, store, API client or styling system beyond one CSS Module.

---

## 2. Proposed Solution & Implementation Plan (The "How")

### 2.1. Toolchain and versions

Checked with `npm view` on 2026-10-05.

| package | range | note |
|---|---|---|
| react, react-dom, @types/react, @types/react-dom | `^19.3.0` | only runtime deps |
| vite | `^8.3.2` | |
| @vitejs/plugin-react | `^6.1.2` | |
| **typescript** | **`~6.0.3`** | **Pinned.** TS 7.0.2 is "latest" but `typescript-eslint@8.71` peers `<6.1.0` → `ERESOLVE`. Never install TS with `@latest`. |
| vitest | `^5.0.3` | |
| @testing-library/react | `^16.3.3` | plus `@testing-library/dom ^10.4.2`, a required peer, installed explicitly |
| jsdom | `^30.1.2` | the Vitest DOM environment; sets the Node floor (see §2.5) |
| eslint, @eslint/js | `^10.12.0`, `^10.0.1` | flat config only |
| typescript-eslint | `^8.71.0` | |
| eslint-plugin-react-hooks | `^7.1.1` | preset `reactHooks.configs.flat.recommended` |
| prettier | `^3.9.9` | defaults; no `.prettierrc` |
| husky | `^9.1.7` | |
| @commitlint/cli, @commitlint/config-conventional | `^21.2.3` | |
| @types/node | `^22.20.5` | matches the runtime major |

Deliberately left out: `@testing-library/jest-dom` (arrives with the first real UI spec), `eslint-config-prettier` (no formatting rules left in the presets), `eslint-plugin-react-refresh`, `globals`, `oxlint`. Tooling added beyond architecture.md's named list: `jsdom`, `@testing-library/dom`, `@eslint/js` and `@types/node`. All are plumbing implied by the listed Vitest/RTL/ESLint/TS, and none ships to the browser.

### 2.2. File layout

| path | responsibility |
|---|---|
| `package.json` | `private`, `"type": "module"`, scripts (§2.5), `engines`, deps |
| `package-lock.json` | committed; CI and reviewers use `npm ci` |
| `.nvmrc` | `22` |
| `index.html` | `#root`, `<title>GREEN-API WhatsApp Chat</title>`, `<noscript>` line, module script `/src/main.tsx` |
| `vite.config.ts` | `base`, react plugin, `define` for build info, `app-version` meta plugin, Vitest `test` block (`/// <reference types="vitest/config" />`) |
| `tsconfig.json` / `tsconfig.app.json` / `tsconfig.node.json` | project references; `strict: true` explicitly in both; app: `types: ["vite/client"]`, `moduleResolution: bundler`, `jsx: react-jsx`, `noEmit`, `verbatimModuleSyntax`, `noUnusedLocals/Parameters`, `erasableSyntaxOnly`; node: `vite.config.ts` only, `types: ["node"]` |
| `eslint.config.js` | flat config on `**/*.{ts,tsx}`: `js.configs.recommended`, `tseslint.configs.strictTypeChecked` (`projectService: true`), `reactHooks.configs.flat.recommended`; `globalIgnores`: `dist`, `coverage`, `.claude`, `.awos`, `bin`, `context` |
| `.prettierignore` | `dist`, `coverage`, `package-lock.json`, `.claude/`, `.awos/`, `bin/`, `context/`, `CLAUDE.md`, `HARNESS.md`, `harness.json`, `.mcp.json`. **Required in the same commit as `format:check`:** 74 existing harness/doc files would fail `prettier --check .`. |
| `commitlint.config.js` | extends `@commitlint/config-conventional` |
| `.husky/commit-msg` | one line: `npx --no -- commitlint --edit "$1"` (husky v9 style, no shebang/sourcing) |
| `.gitignore` | append `node_modules/`, `dist/`, `coverage/` |
| `src/main.tsx` | `createRoot` in `<StrictMode>`, imports `index.css`, renders `<App build={BUILD_INFO} />`, throws if `#root` is missing |
| `src/App.tsx` | the page: `<h1>` app name, skeleton note, version label. Pure: build info arrives as a prop |
| `src/App.module.css` | page layout |
| `src/index.css` | minimal reset + `:root` colour tokens |
| `src/build-info.ts` | the only reader of the injected constants; exports `BuildInfo`, `BUILD_INFO`, `formatVersion()` |
| `src/test-setup.ts` | `afterEach(cleanup)` (Vitest `globals: false`, so RTL's auto-cleanup doesn't register) |
| `src/App.test.tsx` | the smoke test (§4) |
| `.github/workflows/ci.yml` | the single workflow (§2.7) |
| `README.md` | one-line description, "Run locally" (3 lines), live link |

### 2.3. Version label (functional §2.1, §2.5)

- **Injection:** Vite `define`, with `sha = process.env.GITHUB_SHA`:
  - `__APP_COMMIT__` = `sha.slice(0, 7)`, or `null` when `sha` is unset.
  - `__APP_BUILT_AT__` = an ISO timestamp taken at build time, or `null` when `sha` is unset.
- **CI source:** Actions sets `GITHUB_SHA` in every step. On a push to `main` it is the commit GitHub shows. PR builds use a synthetic merge SHA, but they never deploy. Locally the variable is unset, so the label reads `local` in both `dev` and `build`+`preview`.
- **Typing:** module-scoped `declare const` in `src/build-info.ts` only (no ambient globals). `BUILD_INFO: BuildInfo = { commit, builtAt }`.
- **Display contract:** `formatVersion()` returns `local` if either value is null. Otherwise it returns `<7-char sha> · YYYY-MM-DD HH:MM UTC`, e.g. `48aecc4 · 2026-10-05 15:38 UTC`, built by string slicing (no locale or timezone formatting), inside `<time dateTime={builtAt}>`.
- **`app-version` meta:** an inline `transformIndexHtml` Vite plugin (a few lines, no library) writes `<meta name="app-version" content="<sha> <iso>">` (or `local`) into `index.html`. This lets every §2.2 check be done with `curl -s URL | grep app-version`. **Assumption:** accepted (consult open question 4).

### 2.4. Base path and routing

- `base: '/green-api-whatsapp-chat/'`. The built `index.html` references `/green-api-whatsapp-chat/assets/…`. Dev serves and prints `http://localhost:5173/green-api-whatsapp-chat/`.
- Slash-less URL (functional §2.1 c3): GitHub Pages itself answers `301 → …/`. This was verified on a live Actions-deployed project site (`pmndrs.github.io/zustand`), so no app code is needed. It is re-verified on our URL after the first deploy.
- Pages serves `cache-control: max-age=600`, which is why functional §2.2 measures freshness as "10 minutes or more after the run **finished**". The §2.2 c1 check uses **normal navigation without cache-busting**: wait ≥ 10 min after the run finishes, then open the link and `curl` it plain (no `?t=`). Cache-busting is only allowed while debugging, never as the acceptance check.

### 2.5. npm scripts, Node pinning

| script | runs |
|---|---|
| `dev` | `vite` |
| `build` | `vite build` (no `tsc`; typecheck is its own step) |
| `preview` | `vite preview` → `http://localhost:4173/green-api-whatsapp-chat/` |
| `lint` | `eslint .` |
| `typecheck` | `tsc -b` |
| `test` | `vitest run` (`test:watch`: `vitest`) |
| `format` / `format:check` | `prettier --write .` / `prettier --check .` |
| `commitlint` | `commitlint` (CI passes `--from/--to --verbose`; the hook uses `--edit`) |
| `prepare` | `husky` |
| **`check`** | `format:check && lint && typecheck && test && build`. This is the lane gate in `harness.json` **and** what CI's `check` job runs, so they are identical by construction. |

- `.nvmrc` = `22`. `engines.node` = **`^22.22.2`**: the real floor of the toolchain (jsdom 30 needs `^22.22.2`, eslint 10 needs `^22.13`). **Assumption:** keep it honest rather than downgrading to jsdom 29 (consult open question 5).
- No `.npmrc engine-strict`. npm's default on another major is `npm warn EBADENGINE … required: { node: '^22.22.2' }` and it continues, which is exactly functional §2.5 c3. This was verified with Node 24.

### 2.6. Commit linting (functional §2.6)

- **Local:** `prepare: husky` sets `core.hooksPath` to `.husky/_` on `npm ci`/`npm install`. The committed `.husky/commit-msg` then runs commitlint on every commit. Verified: `feat(app): …` exits 0; `updated stuff` exits 1 with `subject may not be empty`, `type may not be empty`.
- **Without `.git`** (zip download): husky 9 prints `.git can't be found` and exits 0, so `npm ci` doesn't break. **In CI:** workflow env `HUSKY=0`, so hooks are never installed on runners.
- **Lane worktrees:** `.husky/_` is gitignored, so a fresh worktree enforces the hook only after `npm ci`. Lanes run `npm ci` first.
- **CI (PRs only):** job `commitlint`. Checkout with `fetch-depth: 0`, then `npm run commitlint -- --from <base.sha> --to <head.sha> --verbose`, with the SHAs passed through `env:`, not interpolated in `run:`. `--verbose` names each failing message (functional §2.6 c3).
- **Push to `main`:** not linted. PR commits were already linted. `commitlint.config.js` sets `defaultIgnores: false` and ignores **only** git's `Merge branch '…'` and GitHub's `Merge pull request #… from …` first lines, so `fixup!`/`squash!`/`Revert "…"` messages are refused (code review 2 F2). Reverts use `revert: …`.
- **Enforcement boundary (review 2 F5, now stated in functional §2.6):** local hook once `npm ci` has run + CI over each PR's commit range. **Accepted gap (Q2):** a multi-commit squash merge takes the unlinted PR title; squash stays enabled and "don't squash multi-commit PRs" is a convention only (CLAUDE.md → Commits).

### 2.7. CI/CD workflow: `.github/workflows/ci.yml`

- **Triggers:** `pull_request` (all branches) and `push` to `main`. `workflow_dispatch` is optional.
- **Workflow-level:** `env: HUSKY: 0`, `permissions: contents: read`.
- **Jobs:**

| job | when | steps / config |
|---|---|---|
| `commitlint` | PR only | checkout `fetch-depth: 0` → setup-node → `npm ci` → commitlint range |
| `check` | every run | `actions/checkout@v7` → `actions/setup-node@v7` (`node-version-file: .nvmrc`, `cache: npm`) → `npm ci` → `npm run check` → **if push to main:** `actions/upload-pages-artifact@v5` (`path: dist`) |
| `deploy` | push to `main` only, `needs: check` | **first step: tip guard** (below); `permissions: { pages: write, id-token: write }`, `environment: github-pages` (url from `steps.deployment.outputs.page_url`), `actions/deploy-pages@v5` |

  The deployed bytes are exactly the bytes that passed the gate, because nothing is rebuilt in `deploy` (F2 is structural). `actions/configure-pages` is not used: `base` is hard-coded, and it can't enable Pages with `GITHUB_TOKEN` anyway.

- **Concurrency (F4; code review 2 F1), at workflow level:** group `ci-${{ github.ref }}`, **`queue: max`** (GitHub's FIFO concurrency queue, up to 100 waiting runs, nothing replaced or cancelled). GitHub refuses `queue: max` together with `cancel-in-progress: true`, so PR runs no longer cancel superseded runs either: they finish in order (accepted, a few extra CI minutes).
  - All `main` runs share one group and run strictly one at a time, in the order they started waiting. A re-run of an older run joins the end of the queue; it can no longer replace the pending tip run (the code-review-2 F1 scenario), and the tip guard then makes it skip publishing.
  - Because the group covers the whole run (check + deploy), `main` runs execute strictly in push order. A run is only ever dropped by a **newer** run, so the page can never go backwards.
  - Job-level concurrency on `deploy` alone would **not** guarantee this: a slow older `check` could deploy after a newer one. `ci.yml` carries a comment citing F4 so nobody moves it.
  - Accepted edge: if the tip's own `check` fails, the page stays on the last published commit, which may be older than an intermediate commit that passed but was skipped by the tip guard. That is not backwards, and §2.4 c1 describes it. (The earlier "B is cancelled" edge no longer exists with `queue: max`.)
- **Tip guard (review 2 F1), first step of `deploy`:** concurrency alone does not cover a manual **re-run of an older `main` run**, and GitHub orders queued runs by when they start waiting. So `deploy` compares `GITHUB_SHA` with the current tip of `main` (`git ls-remote origin refs/heads/main`, no checkout needed). If they differ, it skips `deploy-pages` with a `::notice::` ("superseded by <tip>; not publishing") and the job ends green: a newer run owns publishing. Only the commit that is the tip at deploy time can publish, so the page can never move to an older commit. Accepted edge: if the tip's own check fails, the page stays on the last published commit, which may be older than an intermediate commit that passed but was skipped. That is not backwards, and §2.4 c1 already describes it.
- **Failure behaviour (functional §2.4):**
  - `check` red → `deploy` skipped, run red, page unchanged.
  - `deploy-pages` red → the previous Pages deployment keeps serving (the switch is atomic) and the run is red.

### 2.8. GitHub repository setup

Each step needs the user's OK (D3).

- **Enable Pages with the Actions source:** `gh api -X POST repos/dustyo-O/green-api-whatsapp-chat/pages -f build_type=workflow`, or `PUT` if Pages already exists. Confirm with `gh api repos/…/pages --jq '.build_type,.html_url'`, which should print `workflow` and `https://dustyo-o.github.io/green-api-whatsapp-chat/`. This also creates the `github-pages` environment.
- **Timing (Q3):** deliberately **after** the skeleton PR is merged: the first `main` run's `deploy` fails with nothing published (functional §2.4 c2/c3 observed for real), then Pages is enabled and the run is re-run with `gh run rerun <id> --failed`.
- **Merge methods (Q2):** unchanged — no settings call.

### 2.9. CORS check from the live origin (review F1, `[Lead]` step)

- **Where:** on `https://dustyo-o.github.io/green-api-whatsapp-chat/`, open DevTools → Console and paste the consult's snippet (§9 of the consult file). It uses a **fake** id and token and makes 6 calls:
  - 2 hosts: `api.green-api.com`, and `7103.api.greenapi.com` paired with a matching `7103…` id.
  - 3 calls per host: GET `getStateInstance` (simple request); POST `sendMessage` with JSON (preflighted); DELETE `deleteNotification/1` (preflighted).
- **Pass:** all 6 rows show `PASS` with an HTTP status (expected `401`), and each POST/DELETE shows an `OPTIONS 200` in the Network tab.
- **Fail:** any `TypeError: Failed to fetch` / `NetworkError…` / `Load failed`, plus "blocked by CORS policy". The table and console line go into the `tasks.md` ledger.
- **Finding carried to "Sign-In & Session":**
  - A **mismatched** host and id (e.g. `7103.api.greenapi.com` with a `1101…` id) gets a `403` from nginx with no CORS header.
  - A host that doesn't exist (`1101.api.greenapi.com`) doesn't resolve.
  - In the browser, both surface as `TypeError: Failed to fetch`, not as an HTTP status. So the login's "check the API URL" hint must also trigger on network-level failures, not only on 4xx responses.

---

## 3. Impact and Risk Analysis

- **System Dependencies:**
  - GitHub Actions and GitHub Pages (hosting and CI).
  - The `dustyo-O` account's `gh` token (`repo` scope, enough for the Pages and merge-settings calls).
  - npm registry availability for `npm ci`.
  - No GREEN-API dependency at runtime; only the one-off CORS check touches it.
  - The harness lane gate (`harness.json → npm run check`) now exists.
- **Potential Risks & Mitigations** (riskiest first; slice 1 takes #1):
  1. **Pages never serves, or serves a blank page** (Pages not enabled or wrong source, wrong `base`, missing `github-pages` environment). *Mitigation:* slice 1 = minimal page + workflow + Pages enablement. Before merging, `npm run build && npm run preview` must render at `localhost:4173/green-api-whatsapp-chat/`. After merging, the lead runs the `curl -sI` checks (`…/green-api-whatsapp-chat` → `301`, `…/` → `200`, `app-version` meta = `git rev-parse --short=7 origin/main`) and opens the page in a browser.
  2. **The F4 ordering guarantee depends on workflow-level concurrency** and silently regresses if it is moved to job level or `cancel-in-progress` is set on `main`. *Mitigation:* a comment in `ci.yml` citing F4, plus the two-merges lead check (functional §2.2 c3).
  3. **TypeScript 7 breaks typescript-eslint** (`ERESOLVE`). *Mitigation:* `~6.0.3` pinned here and in the lane brief; never `@latest`.
  4. **`prettier --check .` fails on 74 harness/doc files.** *Mitigation:* `.prettierignore` lands in the same commit as `format:check`.
  5. **Commits that skip commitlint:** squash merges (unlinted PR title), or lane worktrees before `npm ci`. *Mitigation:* squash gap accepted (Q2), convention in CLAUDE.md; lanes run `npm ci` first.
  6. **"Three commands" counting:** clone + `cd` + `npm ci` + `npm run dev` is four. *Mitigation:* `clone && cd` is line 1 (Q1).
  7. **Node floor `^22.22.2`:** an older 22.x shows an EBADENGINE warning, and whether the tools then work is **not** guaranteed. *Mitigation:* the functional spec and README say "Node.js 22.22.2 or newer 22.x"; the fresh-clone check runs on exactly 22.22.2.
  8. **The CDN's 10-minute cache** makes a fresh deploy look stale for up to 10 minutes. *Mitigation:* functional §2.2 c1 is measured ≥ 10 min after the run finishes, with normal navigation; cache-busting only for debugging.
  9. **A wrong derived GREEN-API host looks like a CORS failure** (§2.9 finding). It doesn't affect this spec; it is recorded for "Sign-In & Session".

---

## 4. Testing Strategy

- **Automated (in `npm run check`, every PR and every `main` push):**
  - The smoke test in `src/App.test.tsx` renders `<App build={…}>` with **explicit** build info, never the real `BUILD_INFO`, because CI sets `GITHUB_SHA` during `check` and would change the result. Two cases:
    1. `{ commit: 'abc1234', builtAt: '2026-10-05T14:25:31.000Z' }` shows the heading "GREEN-API WhatsApp Chat", the skeleton note, and the label exactly `abc1234 · 2026-10-05 14:25 UTC`.
    2. `{ commit: null, builtAt: null }` shows the label exactly `local`.
  - RED proof: break `formatVersion` (e.g. return the full ISO string), watch case 1 fail, restore.
  - Format check, lint, typecheck and build are part of the same gate.
- **CI-only:** `commitlint` over each PR's commit range.
- **Lead / manual checks, mapped to the functional criteria** (they run in the verification slice, after the merge to `main`):

| functional criterion | verification |
|---|---|
| §2.1 c1 | auto (content + format); lead: live page shows a real code and time |
| §2.1 c2 | lead: live URL in Chrome, Firefox, Safari, Edge, never blank; optional `verify-ui` screenshot to `docs/screenshots/` |
| §2.1 c3 | lead: `curl -sI …/green-api-whatsapp-chat` → `301` to `…/` |
| §2.2 c1 | lead: ≥ 10 min after the latest `main` run finished, plain `curl` (no `?t=`) `app-version` meta and a normal browser visit both = `git rev-parse --short=7 origin/main` |
| §2.2 c2 | by construction (`deploy` only on push to `main`); lead: label unchanged while the PR run is green |
| §2.2 c3 | lead: two trivial PRs merged < 1 min apart → final label = the later SHA; run list shows the queueing |
| §2.2 c4 | lead: after a newer deploy, `gh run rerun <older main run>` → its `deploy` logs the "superseded" notice, skips publishing, ends green; label unchanged |
| §2.3 c1 | lead: the skeleton PR shows `check` + `commitlint` statuses |
| §2.3 c2 | lead: throwaway PR with a type error → red, label unchanged, PR closed |
| §2.4 c1 | lead (user OK): merge a PR whose check is red → `deploy` skipped, label unchanged → revert via PR |
| §2.4 c2 | **by design** (review 2 F2, user 2026-10-05): Pages switches deployments atomically, so a failed `deploy-pages` never replaces the live one; together with §2.4 c1 (red run → label unchanged, observed). Not provoked. |
| §2.4 c3 | lead (Q3): first `main` run before Pages is enabled → `deploy` red, run marked failed, nothing published; then enable + re-run |
| §2.5 c1 | user/lead: fresh clone in a temp dir on **exactly Node 22.22.2** (`npx -y -p node@22.22.2 -- …`), follow the README, open the printed URL |
| §2.5 c2 | auto (formatting); lead: `npm run dev` shows `local` |
| §2.5 c3 | lead: `npx -y -p node@24 -- npm ci` shows `EBADENGINE … ^22.22.2` |
| §2.6 c1/c2 | lead: `git commit` with each message after `npm ci` |
| §2.6 c3 | lead: throwaway PR with an `updated stuff` commit → `commitlint` red, message named |
| §2.7 c1 | lead: repo front page has the description, 3 run lines and a working link |
| Review F1 | lead: the §2.9 CORS console check on the live page |

- **No e2e/Playwright** in this spec (functional out-of-scope, D5).

---

## Decisions (consult open questions, answered by the user 2026-10-05)

- **Q1 — run-locally count:** line 1 is `git clone … && cd green-api-whatsapp-chat`; README has exactly three lines. Spec unchanged.
- **Q2 — merge methods:** **leave the gap.** Squash merge stays enabled; the convention is "don't squash multi-commit PRs" (CLAUDE.md → Commits). Accepted residual risk: a squash merge's PR title reaches `main` unlinted. No repo-settings change.
- **Q3 — real deploy failure for functional §2.4 c3** (c2 by design, review 2 F2): **yes** — merge the skeleton PR *before* enabling Pages, observe the red run with nothing published, then enable Pages and `gh run rerun --failed`.
- **Q4 — `app-version` meta:** yes (§2.3) — lead's call, not asked: no runtime cost, makes every §2.2 check a `curl`.
- **Q5 — `engines`:** `^22.22.2` with jsdom 30 (§2.5).

# react-frontend consult — spec 001 tech (skeleton & first deploy)

How I checked: `npm view <pkg> version|engines|peerDependencies` (2026-10-05). I built a throwaway prototype in my scratchpad (`create-vite@9.2.1 --template react-ts`, then the dependency set below), ran the full proposed gate there (`npm run check`: format → lint → typecheck → test → build, **all green**), built with and without `GITHUB_SHA`, and ran commitlint and husky by hand. I used `curl -I` against live GitHub Pages sites and GREEN-API, and `gh api` (read-only) for the repo, Pages and action metadata. Nothing in the repo was written apart from this file.

## 1. Versions

| package | latest (`npm view`) | use | note |
|---|---|---|---|
| react / react-dom | 19.3.0 | `^19.3.0` | |
| @types/react / @types/react-dom | 19.3.0 | `^19.3.0` | |
| vite | 8.3.2 | `^8.3.2` | engines `^20.19 \|\| >=22.12` |
| @vitejs/plugin-react | 6.1.2 | `^6.1.2` | peer `vite ^8` ✓ |
| **typescript** | **7.0.2** | **`~6.0.3`** | **Conflict:** `typescript-eslint@8.71.0` peers `typescript >=4.8.4 <6.1.0`. TS 7 is out of range. `create-vite` itself pins `~6.0.2`. Pin `~6.0.3` and **do not** let a bot bump TS to 7. |
| vitest | 5.0.3 | `^5.0.3` | engines `^22.12 \|\| ^24 \|\| >=26`; peer `vite ^6\|^7\|^8` ✓ |
| @testing-library/react | 16.3.3 | `^16.3.3` | peer `react ^18\|\|^19` ✓; **needs `@testing-library/dom ^10` installed explicitly** (10.4.2) |
| @testing-library/jest-dom | 7.0.1 | **skip for now** | Not needed for one smoke test: `getByRole` throws on a miss. Add it with the first real UI spec. |
| jsdom | 30.1.2 | `^30.1.2` | **engines `^22.22.2`**. This is the strictest floor in the set (see §5). |
| eslint | 10.12.0 | `^10.12.0` | engines `^22.13`; flat config only |
| @eslint/js | 10.0.1 | `^10.0.1` | peer `eslint ^10` |
| typescript-eslint | 8.71.0 | `^8.71.0` | peer `eslint ^8.57\|\|^9\|\|^10` ✓, TS `<6.1` (see above) |
| eslint-plugin-react-hooks | 7.1.1 | `^7.1.1` | peer includes `eslint ^10` ✓; flat preset is `reactHooks.configs.flat.recommended` (verified key list: `recommended`, `recommended-latest`) |
| prettier | 3.9.9 | `^3.9.9` | |
| husky | 9.1.7 | `^9.1.7` | |
| @commitlint/cli / config-conventional | 21.2.3 | `^21.2.3` | engines `>=22.12` |
| @types/node | 26.6.4 | **`^22.20.5`** | match the runtime major; satisfies vite and vitest peers |

- The prototype ran a clean `npm i` with **no peer warnings**. `npm ls --all` shows only optional "UNMET" entries (canvas, babel-plugin-react-compiler, …), which are harmless.
- I left out these, though they are commonly added: `eslint-config-prettier` (typescript-eslint v8 and `@eslint/js` recommended no longer carry formatting rules), `eslint-plugin-react-refresh`, `globals` and `oxlint` (now the `create-vite` default, but architecture says ESLint).
- **Architecture-list flag (tooling only, no runtime):** architecture names Vitest + RTL but not the DOM environment, so `jsdom` is implied. `@testing-library/dom` is a required peer of RTL. `@eslint/js` and `@types/node` are plumbing for the listed ESLint and TS. Runtime `dependencies` are exactly `react` and `react-dom`.

## 2. File layout

- `package.json`: `"private": true`, `"type": "module"`, scripts (§5), `engines`, deps.
- `package-lock.json`: committed; CI and reviewers use `npm ci`.
- `.nvmrc`: `22`.
- `index.html`: `<div id="root">`, `<title>GREEN-API WhatsApp Chat</title>`, a `<noscript>` line, `<script type="module" src="/src/main.tsx">`.
- `vite.config.ts`: `base`, react plugin, `define` for build info (§3), `test: { environment: 'jsdom', setupFiles }`. It carries `/// <reference types="vitest/config" />` so `test` typechecks.
- `tsconfig.json`: references only (`tsconfig.app.json`, `tsconfig.node.json`), as in the create-vite template.
- `tsconfig.app.json`: `src/`. Settings: `strict: true` (TS 6 may default it; set it explicitly anyway), `types: ["vite/client"]` (types `*.module.css`), `moduleResolution: bundler`, `jsx: react-jsx`, `noEmit`, `verbatimModuleSyntax`, `noUnusedLocals/Parameters`, `erasableSyntaxOnly`.
- `tsconfig.node.json`: `vite.config.ts` only, with `types: ["node"]` and `strict: true`.
- `eslint.config.js`: flat config. It lints `**/*.{ts,tsx}` with `js.configs.recommended`, `tseslint.configs.strictTypeChecked` and `reactHooks.configs.flat.recommended`, using `parserOptions.projectService: true`. Use `globalIgnores([...])` for `dist`, `coverage`, `.claude`, `.awos`, `bin`, `context`; the harness ships `.js` scripts under `.claude/skills/**`.
- `.prettierignore`: `dist`, `coverage`, `package-lock.json`, `.claude/`, `.awos/`, `bin/`, `context/`, `CLAUDE.md`, `HARNESS.md`, `harness.json`, `.mcp.json`. **Required:** `prettier --check .` against the current repo reports **74 harness/doc files** as unformatted (verified). Prettier defaults otherwise; no `.prettierrc`. Bonus: the `format.sh` PostToolUse hook then also stops rewriting harness docs, because Prettier skips ignored files even when they are passed explicitly.
- `commitlint.config.js`: `export default { extends: ['@commitlint/config-conventional'] }`.
- `.husky/commit-msg`: one line, `npx --no -- commitlint --edit "$1"`.
- `.gitignore`: append `node_modules/`, `dist/`, `coverage/`. The `tsc -b` buildinfo goes to `node_modules/.tmp/`.
- `src/main.tsx`: `createRoot(#root)` inside `<StrictMode>`; renders `<App build={BUILD_INFO} />`; throws if `#root` is missing.
- `src/App.tsx`: the page: `<h1>` app name, skeleton note, version label. Pure: build info comes in through a prop.
- `src/App.module.css`: page layout (CSS Modules).
- `src/index.css`: minimal reset plus `:root` colour tokens, with a dark-mode block if wanted. Imported once in `main.tsx`.
- `src/build-info.ts`: the only reader of the injected constants. Exports `BuildInfo`, `BUILD_INFO` and `formatVersion()` (§3).
- `src/test-setup.ts`: `afterEach(cleanup)` from RTL. It is needed because we keep Vitest `globals: false` with explicit imports, so RTL's auto-cleanup does not register.
- `src/App.test.tsx`: the smoke test (§10).
- `.github/workflows/ci.yml`: the single workflow (§7).
- `README.md`: one-line description, "Run locally" (≤ 3 commands), live link (§2.7).
- No router, no store, no `public/` assets needed. A `public/favicon.svg` is optional and only avoids a console 404.

## 3. Version label (§2.1, §2.5)

- **Mechanism:** Vite `define` in `vite.config.ts`, evaluated at build and dev-server start:
  - `__APP_COMMIT__`: `JSON.stringify(sha ? sha.slice(0, 7) : null)`
  - `__APP_BUILT_AT__`: `JSON.stringify(sha ? new Date().toISOString() : null)`
  - `const sha = process.env.GITHUB_SHA`
- **SHA source in CI:** `GITHUB_SHA`, which Actions sets automatically in every step (no workflow wiring needed). On a `push` to `main` it is the pushed commit, i.e. the merge commit GitHub shows. On `pull_request` it is the synthetic merge ref. That is irrelevant, because PR builds never deploy. Locally the variable is unset, so both constants are `null` and the label shows `local`. This holds for `npm run dev` **and** for a local `npm run build && npm run preview`.
- **7 chars** = GitHub's default short SHA in the web UI (§2.2 c1).
- **Typing:** module-scoped `declare const __APP_COMMIT__: string | null; declare const __APP_BUILT_AT__: string | null;` at the top of `src/build-info.ts`. They are not ambient globals, so nothing else can reach them. `export const BUILD_INFO: BuildInfo = { commit: __APP_COMMIT__, builtAt: __APP_BUILT_AT__ }`.
- **Display:** `formatVersion({ commit, builtAt })` returns `local` when either value is null. Otherwise it returns `` `${commit} · ${builtAt.slice(0,16).replace('T',' ')} UTC` ``, e.g. **`48aecc4 · 2026-10-05 15:38 UTC`**. Formatting is deterministic: no `toLocaleString`, no timezone drift between visitor and CI, and the test can assert the exact string. Render the time inside `<time dateTime={builtAt}>`.
- Verified in the prototype: `GITHUB_SHA=48aecc4f… vite build` puts `48aecc4` and an ISO timestamp into the bundle. A plain `vite build` contains no SHA (`grep -c 48aecc4` → 0).
- **Optional, recommended:** a 5-line inline Vite plugin (`transformIndexHtml`) that adds `<meta name="app-version" content="48aecc4 2026-10-05T15:38:22Z">` to `index.html`. The lead can then check §2.2 with `curl -s URL | grep app-version`, without a browser; the label otherwise lives only in the JS bundle. This is not a library, so architecture is not affected.

## 4. Base path and trailing slash (§2.1 c3)

- `base: '/green-api-whatsapp-chat/'` (with trailing slash). Verified: the built `dist/index.html` references `/green-api-whatsapp-chat/assets/index-*.js|css`. The dev server serves at `http://localhost:5173/green-api-whatsapp-chat/` and prints that URL (§2.5 c1).
- **GitHub Pages redirects the slash-less URL itself (verified on a live Actions-deployed project site).** `pmndrs/zustand` reports `build_type: workflow` in `gh api repos/pmndrs/zustand/pages`. `curl -sI https://pmndrs.github.io/zustand` returns `HTTP/2 301` with `location: https://pmndrs.github.io/zustand/`. The legacy-built `nodejs.github.io/undici` behaves the same. No app code is needed.
- **Lead verification after the first deploy:** `curl -sI https://dustyo-o.github.io/green-api-whatsapp-chat | grep -iE '^(HTTP|location)'` must show `301` and `location: https://dustyo-o.github.io/green-api-whatsapp-chat/`. Then `curl -sI …/green-api-whatsapp-chat/` must return `200`.
- Pages also sends `cache-control: max-age=600` (verified on zustand). That is why §2.2's "10 minutes or more" is the right wording; a hard reload or `?v=` bypasses it while checking.

## 5. npm scripts, `.nvmrc`, `engines`

| script | runs |
|---|---|
| `dev` | `vite` |
| `build` | `vite build` (no `tsc` here, because typecheck is its own step; the template's `tsc -b && vite build` would typecheck twice in `check`) |
| `preview` | `vite preview` (serves `dist` at `http://localhost:4173/green-api-whatsapp-chat/`) |
| `lint` | `eslint .` |
| `typecheck` | `tsc -b` |
| `test` | `vitest run` (`test:watch`: `vitest`, optional) |
| `format` | `prettier --write .` |
| `format:check` | `prettier --check .` |
| `commitlint` | `commitlint` (CI passes `-- --from … --to … --verbose`; the hook uses `--edit`) |
| `prepare` | `husky` |
| **`check`** | `npm run format:check && npm run lint && npm run typecheck && npm run test && npm run build` |

- `check` is the lane gate (`harness.json`) **and** the single command CI's `check` job runs, so the two are identical by construction. Commit linting is not in `check`, because it needs a commit range; locally it is enforced by the hook instead.
- `.nvmrc`: `22`. CI resolves it to the latest 22.x.
- `engines`: `{ "node": "^22.22.2" }`. This is the real floor of the toolchain: `jsdom@30` requires `^22.22.2` and `eslint@10` requires `^22.13`. `^22.12.0` would look friendlier but then lie; the alternative is `jsdom@^29` (floor `^22.13`).
- **What npm does on a different major (verified):** no `engine-strict` is set (npm default false), so it **warns and continues**. `npx -y -p node@24 -- npm ci` on a package with this `engines` printed:
  ```
  npm warn EBADENGINE Unsupported engine {
  npm warn EBADENGINE   package: 'eng@0.0.0',
  npm warn EBADENGINE   required: { node: '^22.22.2' },
  npm warn EBADENGINE   current: { node: 'v24.21.0', npm: '10.9.8' }
  ```
  That matches §2.5 c3 ("warning naming Node.js 22"). Do **not** add an `.npmrc` with `engine-strict=true`: it would turn the warning into an error, which the spec does not ask for. `npm install --node-version=24.1.0` does **not** trigger the root check (tried), so use a real other-major Node for the lead check, as above.

## 6. Commit linting (§2.6)

- **Config:** `commitlint.config.js` extends `@commitlint/config-conventional`. The default `ignores` already skip `Merge branch …` / `Merge pull request …`.
- **Verified locally:** `echo 'feat(app): show build version on placeholder page' | npx commitlint` exits 0. `echo 'updated stuff' | npx commitlint` exits 1 with:
  ```
  ✖   subject may not be empty [subject-empty]
  ✖   type may not be empty [type-empty]
  ✖   found 2 problems, 0 warnings
  ```
  That covers §2.6 c1 and c2; the message names the expected parts.
- **husky v9:** `"prepare": "husky"` makes `npm install`/`npm ci` run `git config core.hooksPath .husky/_` and generate `.husky/_/` (self-gitignored). The committed `.husky/commit-msg` holds the single line above. No shebang or `husky.sh` sourcing is needed; that v8 style is deprecated and breaks in v10.
- **No `.git` (zip download):** verified that husky 9 prints `.git can't be found` and **exits 0** (source: `node_modules/husky/index.js` returns early). `npm ci` therefore does not break.
- **CI:** set `HUSKY: 0` in the workflow `env`. Husky then prints `HUSKY=0 skip install` and exits 0 (verified), so no hooks are installed on runners.
- **Lane worktrees:** `core.hooksPath` lives in the shared `.git/config`, but `.husky/_/` is gitignored. A fresh worktree enforces the hook only after `npm ci` has run in it. Lanes run `npm ci` before their gate anyway, so put `npm ci` first in lane setup.
- **CI step (PRs):** a `commitlint` job, `if: github.event_name == 'pull_request'`, with `actions/checkout@v7` and **`fetch-depth: 0`**. It runs:
  `npm run commitlint -- --from ${{ github.event.pull_request.base.sha }} --to ${{ github.event.pull_request.head.sha }} --verbose`
  The range covers exactly the PR's own commits. `--verbose` prints each failing message, which covers §2.6 c3's "names that description". Use the `--from/--to` values through `env:` vars, not inline in `run:`, as a general Actions hygiene habit.
- **Push to `main`:** nothing is linted. The PR commits were already linted and merge commits are ignored. Gap: GitHub squash-merge uses `COMMIT_OR_PR_TITLE` (verified in repo settings: `allow_squash_merge: true`). A multi-commit squash takes the PR title, which nobody lints. Fix with a lead decision (see Open questions): disable squash merge, or always use "Create a merge commit".

## 7. CI/CD workflow

- **One file:** `.github/workflows/ci.yml`. Deploy sits in the same run as check, so "deploy only after check passed **for the same commit**" (F2) is structural: `needs: check` plus the same `GITHUB_SHA`.
- **Triggers:** `pull_request` (all branches) and `push: branches: [main]`. Limiting `push` to `main` avoids double runs on PR branches. `workflow_dispatch` is optional, for manual re-runs.
- **Workflow `env`:** `HUSKY: 0`.
- **Workflow `permissions`:** `contents: read`.
- **Jobs:**
  1. `commitlint`: PR only (§6).
  2. `check`: every run. Steps:
     - `actions/checkout@v7`
     - `actions/setup-node@v7` with `node-version-file: .nvmrc`, `cache: npm`
     - `npm ci`
     - `npm run check`
     - then, `if: github.event_name == 'push' && github.ref == 'refs/heads/main'`: `actions/upload-pages-artifact@v5` with `path: dist`

     The deployed bytes are therefore exactly the bytes that passed the gate; nothing is rebuilt in deploy.
  3. `deploy`: `needs: check`, same `if`. It has `permissions: { pages: write, id-token: write }`, `environment: { name: github-pages, url: ${{ steps.deployment.outputs.page_url }} }`, and one step, `actions/deploy-pages@v5` (`id: deployment`).
- Latest majors, verified with `gh api repos/<x>/releases/latest`: checkout **v7.0.1**, setup-node **v7.0.0**, upload-pages-artifact **v5.0.0**, deploy-pages **v5.0.1**. `actions/configure-pages` (v6) is **not needed**, because `base` is hard-coded. Its `enablement` input cannot enable Pages with `GITHUB_TOKEN` anyway.
- **Concurrency (F4):** at workflow level:
  ```yaml
  concurrency:
    group: ci-${{ github.ref }}
    cancel-in-progress: ${{ github.event_name == 'pull_request' }}
  ```
  Why this guarantees an older run can never publish over a newer one:
  - All `main` pushes share the group `ci-refs/heads/main`. GitHub allows **one running and one pending** run per group. A newly queued run **cancels the previously pending one**, and with `cancel-in-progress: false` it never cancels the running one.
  - The group applies to the **whole run** (check + deploy). Runs for `main` therefore execute strictly one after another, in the order they were queued (= push order). A run can only be dropped while pending, and only by a **newer** run. So no older run can start after a newer one has started, and the last deploy is always from the newest run that passed.
  - Job-level concurrency on `deploy` alone would **not** guarantee this. If the older commit's `check` is slower, the newer deploy enters the group first and the older one deploys after it. That is exactly the F4 race.
  - PR runs get their own group per PR and cancel superseded runs.
  - Not canceling the running deploy matches GitHub's Pages starter guidance (let production deploys finish).
  - Accepted edge: with A running, B pending and C queued, B is canceled unbuilt. If C then fails its check, the page stays on A. It never goes backwards.
- **§2.4 behaviour:** if `check` fails, `deploy` is skipped and the run is red. If `deploy-pages` fails, the previous Pages deployment keeps serving (Pages switches deployments atomically) and the run is red.

## 8. Enabling Pages

- Current state (read-only `gh api`): repo `dustyo-O/green-api-whatsapp-chat` is public, `main` exists, `has_pages: false`, `GET …/pages` returns 404. Token scopes include `repo`, which is enough for repo-admin Pages calls.
- **Call (outward-facing, needs the user's OK per D3):**
  `gh api -X POST repos/dustyo-O/green-api-whatsapp-chat/pages -f build_type=workflow`
  If Pages already exists with a different source, use `gh api -X PUT repos/dustyo-O/green-api-whatsapp-chat/pages -f build_type=workflow`.
  Confirm with `gh api repos/dustyo-O/green-api-whatsapp-chat/pages --jq '.build_type,.html_url'`, which must print `workflow` and `https://dustyo-o.github.io/green-api-whatsapp-chat/`.
- **Order: before the first run that deploys,** i.e. before the skeleton PR is merged to `main`. PR runs never deploy, so enabling during the PR is fine. If it is forgotten, `deploy-pages` fails ("ensure GitHub Pages has been enabled"), the run is red and nothing is published. Recover with `gh run rerun <id> --failed` after enabling.
- Enabling creates the `github-pages` environment, which the `deploy` job targets. I could not verify that a POST without `source` is accepted on this repo without performing it. That is a side effect I am not allowed to cause, so the lead verifies it with the GET above.

## 9. CORS verification (F1), `[Lead]` step

- **Where:** open `https://dustyo-o.github.io/green-api-whatsapp-chat/` in Chrome, open DevTools → Console, paste the snippet. The page origin must be `https://dustyo-o.github.io`, and the snippet prints it.
- **Snippet** (fake id/token, no real credentials). Logic checked in Node, where all 6 calls returned 401; Node does not enforce CORS, so only the browser run counts.
  ```js
  await (async () => {
    const token = '0000fake0000token' // fake — never a real token
    const targets = [
      ['https://api.green-api.com', '1101000000'],
      ['https://7103.api.greenapi.com', '7103000000'], // derived-host pattern: host prefix = first 4 digits of id
    ]
    const calls = [
      ['GET (simple)', 'getStateInstance', '', { method: 'GET' }],
      ['POST json (preflight)', 'sendMessage', '', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chatId: '0@c.us', message: 'cors-check' }) }],
      ['DELETE (preflight)', 'deleteNotification', '/1', { method: 'DELETE' }],
    ]
    const rows = []
    for (const [host, id] of targets)
      for (const [label, method, suffix, init] of calls) {
        try {
          const r = await fetch(`${host}/waInstance${id}/${method}/${token}${suffix}`, init)
          rows.push({ origin: location.origin, host, call: label, result: 'PASS', status: r.status })
        } catch (e) {
          rows.push({ origin: location.origin, host, call: label, result: 'FAIL', status: String(e) })
        }
      }
    console.table(rows)
  })()
  ```
- **Pass:** all 6 rows read `PASS` with an HTTP status, expected `401`. Getting a status at all proves the browser let JS read the cross-origin response, and the POST/DELETE rows prove the preflight (`OPTIONS`) succeeded. In the Network tab each POST/DELETE has an `OPTIONS` entry with `200`.
- **Fail:** any row `FAIL` with `TypeError: Failed to fetch` (Chrome), `NetworkError when attempting to fetch resource` (Firefox) or `Load failed` (Safari), plus a red console line "blocked by CORS policy". Paste the table and the console line into `tasks.md`.
- **What I already saw with `curl -H 'Origin: https://dustyo-o.github.io'` (server side, not proof of browser behaviour):**
  - Both hosts return `401` with `Access-Control-Allow-Origin: *` on GET, POST and DELETE.
  - `OPTIONS` returns `200` with `Access-Control-Allow-Headers: …Content-Type…`.
  - `Access-Control-Allow-Methods` echoes the requested method: it lists `DELETE` when DELETE is requested.
- **Finding for later specs:** `https://7103.api.greenapi.com` with a **mismatched** instance id (`1101000000`) answers `403` from nginx **without** any `Access-Control-Allow-Origin`. `1101.api.greenapi.com` does not resolve in DNS at all. In a browser, both surface as `TypeError: Failed to fetch`, not as an HTTP status. So a wrong derived API URL at login will look like a network/CORS failure, and the "check the API URL in your console" hint must key off `TypeError` too, not only off a 4xx. That is why the snippet pairs each host with a matching id.
- Optional, nothing extra to install: repeat once in Safari, the strictest about preflight.

## 10. Tests

- **Config:** in `vite.config.ts`, `test: { environment: 'jsdom', setupFiles: ['./src/test-setup.ts'] }`; `globals` stays false, with explicit `import { describe, it, expect } from 'vitest'`. Test files sit in `src/` and are typechecked by `tsconfig.app.json` (verified: `tsc -b` passes).
- **The smoke test, `src/App.test.tsx`:** it renders `<App build={…} />` with **explicit** build info, never the real `BUILD_INFO`. Otherwise the result would differ between local runs (`local`) and CI, where `GITHUB_SHA` is set during `npm run check`. That is a real trap; the prop design avoids it. Two cases:
  1. `{ commit: 'abc1234', builtAt: '2026-10-05T14:25:31.000Z' }`: the heading "GREEN-API WhatsApp Chat" (`getByRole('heading', { name })`), the skeleton note (`getByText(/early skeleton/i)`), and the label text exactly `abc1234 · 2026-10-05 14:25 UTC`.
  2. `{ commit: null, builtAt: null }`: the label is exactly `local`.

  Prototype result: `Test Files 1 passed (1) · Tests 2 passed (2)`.
- **RED proof for the lane:** break `formatVersion` (e.g. return the full ISO string) and watch case 1 fail. Then restore it and watch it pass.

**Criterion map:**

| criterion | how verified |
|---|---|
| §2.1 c1 name, note, code, time | **auto:** smoke test (content + format). **Lead:** live page shows a real code and time. |
| §2.1 c2 four browsers, never blank | **Lead/manual:** open the live URL in Chrome, Firefox, Safari, Edge (Vite 8's default target is the widely-available baseline). Optional verify-ui screenshot to `docs/screenshots/`. |
| §2.1 c3 no trailing slash | **Lead:** `curl -sI` → 301 → `/` (§4). |
| §2.2 c1 code matches GitHub short SHA | **Lead:** after merge, `git rev-parse --short=7 origin/main` = page label (or `curl \| grep app-version` if the meta is added). |
| §2.2 c2 unmerged PR doesn't publish | **By construction** (`deploy` `if: push && main`). **Lead** observes the label unchanged while the skeleton PR's run is green. |
| §2.2 c3 two merges < 1 min | **Lead:** merge two trivial PRs back to back; the run list shows the second queued behind the first; final label = second SHA. |
| §2.3 c1 check on every PR | **Lead:** the skeleton PR itself shows the `check` (and `commitlint`) status. |
| §2.3 c2 broken build → red, page unchanged | **Lead:** throwaway PR with a type error → red; label unchanged; close the PR. |
| §2.4 c1 failed check on `main` not published | **Lead (user OK):** merge a PR whose check is red (no branch protection); `deploy` skipped; label unchanged; then revert by PR. |
| §2.4 c2/c3 deploy fails → previous page, run red | **By design** (§7); see Open questions for how or whether to provoke it. |
| §2.5 c1 three commands | **Lead/User:** fresh clone in a temp dir on Node 22, follow the README, open the printed URL. |
| §2.5 c2 label "local" locally | **auto:** smoke test case 2 (formatting). **Lead:** `npm run dev`, page shows `local` (the `define` fallback in `vite.config.ts` is not unit-tested). |
| §2.5 c3 other major → warning | **Lead:** `npx -y -p node@24 -- npm ci` shows `EBADENGINE … required: { node: '^22.22.2' }` (§5). |
| §2.6 c1/c2 local accept/refuse | **Lead:** `git commit` with each message after `npm ci` (or `echo … \| npx commitlint`). |
| §2.6 c3 CI names the bad message | **Lead:** throwaway PR with an `updated stuff` commit → `commitlint` job red with that message in `--verbose` output. |
| §2.7 c1 README | **Lead:** open the repo front page; ≤ 3 commands; the link works. |

## 11. Risks (riskiest first)

1. **Pages never serves, or serves blank.** Causes: Pages not enabled or `build_type` not `workflow`, a wrong `base`, or a missing `github-pages` environment, so the first deploy fails or 404s on assets. *Mitigation:* slice 1 = the minimal page + workflow + Pages enablement. Before merging, run `npm run build && npm run preview` and open `http://localhost:4173/green-api-whatsapp-chat/` to prove `base` locally. Enable Pages (§8) during the PR. After merge, the lead runs the `curl` checks (§4) and opens the page.
2. **The F4 ordering guarantee rests on workflow-level concurrency.** If someone later moves `concurrency` to the `deploy` job or sets `cancel-in-progress: true` on `main`, the race returns silently. *Mitigation:* a comment in `ci.yml` citing F4, and the §2.2 c3 lead check with two back-to-back merges.
3. **TypeScript 7 incompatibility.** `npm i -D typescript` installs 7.0.2, which breaks typescript-eslint's peer range (`<6.1.0`) with `ERESOLVE`. *Mitigation:* pin `~6.0.3` in the tech spec and the lane brief, and never use `@latest` for TS.
4. **`prettier --check .` fails on 74 existing harness/doc files.** *Mitigation:* `.prettierignore` (§2) lands in the same commit as the `format:check` script.
5. **"Three commands" vs `cd`.** `git clone` + `cd` + `npm ci` + `npm run dev` is four. *Mitigation:* put three lines in the README, with `git clone … && cd green-api-whatsapp-chat` as line 1 (see Open questions).
6. **Commits that skip commitlint.** Squash merges with an unlinted PR title, or a lane worktree where `npm ci` has not run yet, so `.husky/_` is missing. *Mitigation:* disable squash merge, or merge-commit only (lead/user decision). Lanes run `npm ci` first.
7. **Node floor `^22.22.2`.** A reviewer on an older 22.x sees EBADENGINE warnings, though everything still runs. *Mitigation:* the README says "Node.js 22 (latest 22.x)". The alternative is `jsdom@^29` with `engines ^22.13.0`.
8. **Wrong GREEN-API host looks like a CORS failure in the browser** (§9 finding). It does not affect this spec, but it affects "Sign-In & Session". *Mitigation:* record it in the F1 `tasks.md` note so the login spec's error mapping treats `TypeError` on the derived host as a "check API URL" case.
9. **The CDN's 10-minute cache can make a fresh deploy look stale** (`cache-control: max-age=600`). *Mitigation:* the lead checks with a hard reload or `curl` plus a `?t=` query; this is already aligned with §2.2 c1's 10-minute wording.

## Open questions for the lead

1. **Run-locally wording (§2.5 c1 / §2.7):** is `git clone https://github.com/dustyo-O/green-api-whatsapp-chat.git && cd green-api-whatsapp-chat` acceptable as "command 1"? If not, the spec's "at most three" needs a note that `cd` is not counted.
2. **Squash merges:** disable `allow_squash_merge` (and `allow_rebase_merge`?) via `gh api -X PATCH repos/dustyo-O/green-api-whatsapp-chat -F allow_squash_merge=false`? That needs the user's OK. The alternative is a PR-title lint step. Without either, §2.6 has a hole on squash merges.
3. **§2.4 c2/c3 (deploy itself fails):** accept as verified by design plus GitHub's documented behaviour, or provoke one real failure? The cheapest real failure is merging the first workflow **before** enabling Pages: a red run with nothing published, then enable and re-run. That deliberately sequences step 8 after the merge.
4. **Add the `<meta name="app-version">` plugin (§3)?** It makes every §2.2 lead check a one-line `curl` instead of a browser visit. I recommend yes.
5. **`engines`:** `^22.22.2` (honest, jsdom 30) or `^22.13.0` with `jsdom@^29`?

---
_consult: react-frontend · perms: auto · model: default · 2026-10-05T17:25:51+02:00_

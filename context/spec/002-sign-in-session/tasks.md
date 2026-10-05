# Tasks — spec 002 Sign-In & Session (TKT-2)

- Functional: [functional-spec.md](functional-spec.md) · Technical: [technical-considerations.md](technical-considerations.md) · Reviews: [reviews/TRIAGE.md](reviews/TRIAGE.md)
- Branch: `feat/TKT-2-sign-in-session`. Lanes: `react-frontend` (gate `npm run check`), `testing-expert` (test files only).
- One PR at the end. The riskiest unknown is the real instance (derived API URL, real `getSettings` shape, timing), so it's checked by the user at the end of Slice 1 on a local dev server, before any styling.

## Standing rules

- Run `npm ci` first in every fresh worktree.
- Never put real GREEN-API credentials in code, tests, fixtures, logs or commit messages. Tests use MSW only; browser checks by agents use **fake** ids/tokens only.
- Install with the exact ranges in tech §2.6 (`zustand@^5.0.15`, `msw@^3.0.2`, `@testing-library/user-event@^14.6.7`); never `@latest`.
- MSW `server.listen()` per test file, never in `src/test-setup.ts` (the e2e tests make real local requests).
- Russian texts exactly as functional §2.1/§2.2; don't reword them.
- Conventional Commits (CLAUDE.md → Commits). Keep it minimal: no extras beyond the spec (user rule: avoid overengineering).

---

- [ ] **Slice 1: Working sign-in, plain markup**
  - [x] Add the deps (tech §2.6). Build `src/api/green-api.ts`, `src/auth/check-instance.ts` (outcome mapping exactly as tech §2.2, incl. status-before-parse and a strict settings guard), `src/auth/messages.ts`, `src/auth/credentials.ts` (derivation, normalize, validation per tech §2.4 incl. scheme+host-only URLs), and `src/auth/session-store.ts` (tech §2.3). Add unit and MSW tests: `credentials.test.ts`, `messages.test.ts` and table-driven `check-instance.test.ts` (one case per row of tech §2.2, empty-body 401, `getSettings` skipped when not authorized), with RED proof for the mapping. **[Agent: react-frontend]** _(Done 2026-10-05: `a2d9838` `ed94674` `5aa6f2f`. Status-before-parse, strict settings guard, 29 check-instance cases. RED: body-before-status → 3 fail, flat mapping → 11, always-fetch-settings → 8. Surprises: MSW 3 renamed `onUnhandledRequest` → `onUnhandledFrame`; helper named `setupGreenApiServer` because a `use…` name trips the hooks lint rule.)_
  - [x] Wire the screens with plain, unstyled markup: `App.tsx` switches on `screen`; `main.tsx` calls `resume()` once before render; `LoginScreen` (three fields, derived read-only API URL + «Указать API URL вручную», show/hide token, hints, busy «Проверяем…», error block + «Проверить снова», spec 001 heading and version footer); `MainScreen` («Инстанс {id}», «Выйти», «Выберите чат, чтобы начать переписку»). Rewrite the spec 001 "early skeleton" assertions (`src/App.test.tsx`, `src/main.test.tsx`, `e2e/published-build.test.ts`) to the sign-in screen (tech §2.7). Add RTL + MSW integration tests for functional §2.1–§2.5 (`sign-in.test.tsx`). **[Agent: react-frontend]** _(Done 2026-10-05: `ee8f9c1`. `App.module.css` removed (slice 2 restyles from scratch); spec 001 assertions now check «Войти», the e2e checks «Указать API URL вручную» in the bundle. 21 integration tests load the real `main.tsx` with modules reset to simulate reloads; RED: no resume → 4, signOut keeping creds → 1, no busy lock → 1, hints/readOnly/toggle → 5, failed reload dropping creds → 1. Surprise: during RED the lane `git checkout`-ed uncommitted files and reverted `main.tsx` to spec 001; restored by hand, committed, mutations redone on the committed tree.)_
  - [x] Verify: `npm run check` green. Start `npm run dev` on a free port and, with `verify-ui` and **fake** credentials, check that `7103000000` / `badtoken` gives the real «Неверный idInstance или apiTokenInstance.» (a real GREEN-API 401) and that a custom API URL `https://7103.api.greenapi.com` with id `1101000000` gives «Не удалось связаться с https://7103.api.greenapi.com…» (a real `TypeError`). Stop the server; no screenshots kept. **[Agent: react-frontend]** _(Done 2026-10-05: on `npm run dev`, fake `7103000000`/`badtoken` → real 401 → «Неверный idInstance или apiTokenInstance.»; custom `https://7103.api.greenapi.com` + `1101000000` → CORS `TypeError` → «Не удалось связаться с https://7103.api.greenapi.com. …»; «Проверяем…» while checking; `getSettings` never called. Surprise: a crash in the verify-ui fork's script sent one extra fake check to GREEN-API; no screenshots kept; server stopped. Lead re-ran on the merged tree: 11 files, 135/135, `check` exit 0.)_
  - [ ] Merge the lane, run the gate, then start `npm run dev` for the user and give them the URL. **[Lead]**
  - [ ] Real-instance check on the local dev server: (1) the auto-filled API URL equals the one in the GREEN-API console; (2) «Войти» with your real idInstance + token reaches «Инстанс …» quickly; (3) a reload shows «Проверяем инстанс…» then the main screen; (4) «Выйти» → empty form, and it stays after a reload. Report anything odd (e.g. a catch-all message on a ready instance). **[User]**

- [ ] **Slice 2: WhatsApp Web look**
  - [ ] Add the palette tokens to `src/index.css` (light + dark, tech §2.5). Style `LoginScreen` (a centred card, labelled inputs, hints, green «Войти», the error block in `--color-danger`, the version footer) and `MainScreen` (two columns `minmax(280px, 30%) 1fr`, a 60px header with «Инстанс {id}» and «Выйти», the muted centred placeholder). CSS Modules only; no icons, avatars or mobile layout. **[Agent: react-frontend]**
  - [ ] Verify: `npm run check` green. With `verify-ui` on `npm run dev` (fake credentials, MSW not needed: check the login card and, by seeding a mocked signed-in state in a test or via the store in the console, the main screen): no overflow at 1280×800 and 375×667, all texts present, light and dark. Delete screenshots. **[Agent: react-frontend]**

- [ ] **Slice 3: Feature Testing & Regression**

  > Verifies the whole feature end-to-end against functional-spec.md, run after all implementation slices are complete.
  - [ ] Read functional-spec.md acceptance criteria in full. Generate acceptance-level tests that verify the entire feature as a whole — not individual slices. Cover applicable layers (unit for pure logic, integration for service interactions, e2e for user flows) based on the project's testing stack. Write tests with RED validation (must fail before implementation is confirmed done). Annotate each test with `@spec: 002-sign-in-session` and `@regression` if suitable for long-term regression. **[Agent: testing-expert]**
  - [ ] Run all generated tests. All must pass. Fix any failures before proceeding. **[Agent: testing-expert]**

- [ ] **Slice 4: Ship**
  - [ ] Push, open the PR (`feat: sign-in and session`, links tasks.md + reviews/, `Refs: TKT-2`), run `/harness:review-code 002`, fix through the lane, merge with a merge commit once green. Comment the PR on TKT-2. **[Lead]**
  - [ ] On the live site with **fake** credentials, in Chromium and WebKit: the wrong-token message and the unreachable message appear (real GREEN-API answers from `https://dustyo-o.github.io`). **[Lead]**
  - [ ] On the live site with your real instance: sign in, reload, log out. Optionally: in the console, set a webhook URL or switch incoming notifications off and check the message, then undo it. **[User]**

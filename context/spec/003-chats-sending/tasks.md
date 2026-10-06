# Tasks — spec 003 Chats & Sending (TKT-4)

- Functional: [functional-spec.md](functional-spec.md) · Technical: [technical-considerations.md](technical-considerations.md) · Reviews: [reviews/TRIAGE.md](reviews/TRIAGE.md)
- Branch: `feat/TKT-4-chats-sending`. Lanes: `react-frontend` (gate `npm run check`), `testing-expert` (test files only). One PR at the end.
- **GREEN-API Developer plan limits:** 3 correspondents/month and 100 `checkWhatsapp`/month. All real checks reuse the same one or two numbers.

## Standing rules

- Run `npm ci` first in every fresh worktree.
- Never put real GREEN-API credentials or real phone numbers in code, tests, fixtures, logs or commits. Tests use MSW only; agent browser checks use **fake** ids and tokens.
- No new dependencies (tech §4).
- MSW `server.listen()` per test file, never in `src/test-setup.ts`.
- The Russian texts exactly as in the functional spec.
- Conventional Commits. Keep it minimal (user rule: avoid overengineering).

---

- [ ] **Slice 1: GREEN-API calls proven before any UI**
  - [x] Extend `src/api/green-api.ts` with JSON POST, `checkWhatsapp` and `sendMessage` (tech §2.3). Add `src/chat/outcomes.ts` (`checkNumber` → `exists | notOnWhatsapp | invalidNumber | checkFailed`; `sendText` → `sent | failed | unknown`; 15 s budget; exactly the tech §2.2 tables) and `src/chat/phone.ts` (tech §2.5). Extend `src/test/green-api-server.ts` with POST handlers and recorded bodies. Unit tests: `phone.test.ts` and table-driven `outcomes.test.ts` (POST + JSON + exact bodies, a 400 `Bad phone number` body, no token in errors), with RED proof. **[Agent: react-frontend]** _(Done 2026-10-06: `b50c6f5`. JSON POST in `request()`; only `checkWhatsapp` reads its 400 body (into `GreenApiError.text`). MSW `reply()` answers POSTs and records `{method, contentType, body}`; helpers `whatsappExists`/`sentAs`. 69 tests (16 check rows, 13 send rows, exact URL/JSON/body, `Bad phone number` as JSON and as text, no token in errors). RED: 9 mutations, all caught (GET instead of POST → 13; 400 body unread → 2; every 400 = invalid → 2; 5xx = failed → 2; empty idMessage → 1; URL in error → 2; trimmed message → 1; formatTitle length → 1; dashes kept → 4). The `Bad phone number` body shape is a guess until the user probe.)_
  - [x] Verify: `npm run check` green. **[Agent: react-frontend]** _(Done 2026-10-06: exit 0, 13 files, 226/226. Lead re-ran on the merged tree: 226/226, exit 0.)_
  - [x] Merge, run the gate, and give the user three ready-to-paste `curl` commands for their own instance (token as a shell variable they set themselves, never pasted into chat): `checkWhatsapp` for (a) their main WhatsApp number, (b) a number without WhatsApp, (c) `7123`. **[Lead]** _(Done 2026-10-06: gate 226/226; commands given with the token read via `read -s`, never in chat.)_
  - [x] Run the three `curl` commands and paste back the status lines and bodies (they contain no secrets). This uses 3 of the 100 monthly checks. **[User]** _(Done 2026-10-06 by the user (6 calls). Results, token redacted: existing WhatsApp → `200 {"existsWhatsapp":true,"chatId":"<n>@lid","username":"","phoneNumber":"<n>@c.us","fromCache":…}`; no WhatsApp → `200 {"existsWhatsapp":false,"chatId":"",…}`; `7123@c.us` → `400 {"statusCode":400,"timestamp":…,"path":"/waInstance<id>/checkWhatsapp/<TOKEN>","message":"Validation failed. Details: 'chatId' must be one of the next formats: 'phone_number@c.us' or 'chat_id@lid'"}`. **Surprises:** (1) the short-number 400 is `Validation failed … 'chatId' must be …`, not `Bad phone number`; (2) **GREEN-API echoes the token in the 400 body's `path`**. The user pasted it, so the token was rotated.)_
  - [x] Record the real answers in the ledger and adjust `outcomes.ts` mapping and tests if they differ from tech §2.1/§2.2 (e.g. the exact `Bad phone number` body) via the lane. **[Lead]** _(Done 2026-10-06: recorded above; adjustment → Slice F1.)_

- [ ] **Slice 2: Start a chat**
  - [ ] Add `src/chat/chats-store.ts` (tech §2.4: per-instance key, `skipHydration`, `open`/`wipe` hooked into `session-store.ts`, the `merge` with validation and `sending → unknown`, derived sort order). Add `NewChatForm` (picker, «Другая страна» code, number, `<fieldset disabled>` lock with «Проверяем…», every §2.1 message, the stale-instance guard from tech §2.6, the row closing on success) and `ChatList` (title formatting, one-line preview, `HH:MM`, the empty text, `aria-current`). Fill `MainScreen` (header «+», body, right area placeholder or an empty conversation header). Tests: `chats-store.test.ts` and RTL + MSW for functional §2.1 and §2.2 (the second criterion of §2.2 comes with sending in slice 3), with RED proof. **[Agent: react-frontend]**
  - [ ] Verify: `npm run check` green. With `verify-ui` on `npm run dev` (GREEN-API stubbed with `page.route`, fake ids): «+» → `903 747-44-11` → chat `+7 903 747-44-11` opens; «Другая страна» `381` + `629443720` → `+381629443720`; reload keeps both. Delete screenshots, stop the server. **[Agent: react-frontend]**

- [ ] **Slice 3: Send messages**
  - [ ] Add `Conversation` (header, bubbles with `HH:MM` and 🕓/✅/❗/❔, «Повторить», `window.confirm` for ❔, scroll to the newest) and `Composer` (`maxLength={20000}`, `field-sizing` auto-grow up to 6 lines, Enter / Shift+Enter, `isComposing` guard, text sent as typed, the per-chat draft binding). Wire `send`/`retry` in the store. Add the new tokens to `src/index.css` (tech §2.7). RTL + MSW tests for functional §2.2 c1 (re-sorting on send), §2.3 and §2.4, incl. a confirm false/true spy and the draft surviving a chat switch and a reload, with RED proof. **[Agent: react-frontend]**
  - [ ] Verify: `npm run check` green. With `verify-ui` (stubbed GREEN-API, fake ids): «Привет» → 🕓 → ✅; a refused send → ❗ → «Повторить» → ✅; 10 typed lines → the box stops at 6 lines and scrolls (save **one** screenshot `docs/screenshots/003-composer-6-lines.png`, keep it); light and dark, no overflow at 1280×800. Delete other screenshots, stop the server. **[Agent: react-frontend]**

- [ ] **Slice 4: Feature Testing & Regression**

  > Verifies the whole feature end-to-end against functional-spec.md, run after all implementation slices are complete.
  - [ ] Read functional-spec.md acceptance criteria in full. Generate acceptance-level tests that verify the entire feature as a whole — not individual slices. Cover applicable layers (unit for pure logic, integration for service interactions, e2e for user flows) based on the project's testing stack. Write tests with RED validation (must fail before implementation is confirmed done). Annotate each test with `@spec: 003-chats-sending` and `@regression` if suitable for long-term regression. **[Agent: testing-expert]**
  - [ ] Run all generated tests. All must pass. Fix any failures before proceeding. **[Agent: testing-expert]**

- [ ] **Slice 5: Ship**
  - [ ] Push and open the PR (`feat: chats and sending`, links tasks.md + reviews/, `Refs: TKT-4`). **Confirm `gh pr checks` lists passing `check` + `commitlint` before merging** (reopen the PR if no checks appear). Run `/harness:review-code 003`, fix through the lane, merge with a merge commit. Comment the PR on TKT-4. **[Lead]**
  - [ ] On the live site with your real instance: «+» → your main WhatsApp number → «Начать чат»; send «Привет» → ✅; it arrives on your main phone; reload → the chat and the message are still there; «Выйти» and sign in again → «Нет чатов…». **[User]**

- [x] **Slice F1: Real checkWhatsapp answers (from the slice-1 probe)**
  - [x] In `src/api/green-api.ts` / `src/chat/outcomes.ts`: (1) **never keep the raw 400 body**. GREEN-API echoes the token in its `path` field. Decide `invalidNumber` at parse time and store only a boolean (or an enum) in `GreenApiError`, never the text; add a test proving no field of the thrown error contains the token when the 400 body includes it in `path`. (2) Map a `checkWhatsapp` 400 to `invalidNumber` when its message contains `Bad phone number` **or** `'chatId' must be` (the real body: `Validation failed. Details: 'chatId' must be one of the next formats: 'phone_number@c.us' or 'chat_id@lid'`); any other 400 stays `checkFailed`. Use the real body (with a fake token in `path`) as the test fixture. RED proof. **[Agent: react-frontend]** _(Done 2026-10-06: `3f7a4e5`. `GreenApiError.text` → `invalidNumber: boolean`, decided in `request()` with `/Bad phone number|'chatId' must be/` only for `checkWhatsapp` 400s; the body is never stored. The fixture is the real probe body with a fake token in `path`; the no-token test checks every field (`Object.values`). RED: both new tests failed before, 41/41 after. An old `{description: "Validation failed"}` 400 still → `checkFailed`.)_
  - [x] Verify: `npm run check` green. **[Agent: react-frontend]** _(Done 2026-10-06: 228 tests, lint/typecheck/build clean. Lead re-ran on the merged tree: 228/228, exit 0.)_

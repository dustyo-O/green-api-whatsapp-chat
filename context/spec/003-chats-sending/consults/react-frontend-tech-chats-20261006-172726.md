## 1. GREEN-API contracts

**From the official docs** (fetched 2026-10-06):

- **`checkWhatsapp`**: <https://green-api.com/en/docs/api/service/CheckWhatsapp/>
  - Request: `POST {apiUrl}/waInstance{idInstance}/checkWhatsapp/{apiTokenInstance}`, JSON body.
  - Body: exactly one of `chatId` (string: `79001234567`, `79001234567@c.us` or `…@lid`) or `phoneNumber` (integer, 11–16 digits, **deprecated**). There's also an optional `force: boolean`.
  - **Use `{ "chatId": "<code><digits>@c.us" }`.** `phoneNumber` is deprecated, and as a JS number a 16-digit value can go past `Number.MAX_SAFE_INTEGER`.
  - 200 body: `{ existsWhatsapp: boolean, chatId: string (may be a @lid), username, phoneNumber, fromCache }`. **Read `existsWhatsapp` only.** The chat key stays our own `…@c.us`; we ignore the returned `chatId`.
  - Documented errors, all **400**: `Validation failed`, `Bad phone number` ("valid from 11 to 16 digits"), `check phone number timeout limit exceeded`, `XOR Validation failed`.
- **`sendMessage`**: <https://green-api.com/en/docs/api/sending/SendMessage/>
  - Request: `POST …/sendMessage/{token}`, body `{ chatId, message }`. `message` is at most 20 000 chars. Don't send `linkPreview` (it defaults to on, and that's harmless).
  - 200 body: `{ "idMessage": "3EB0C767D097B7C7C030" }`.
  - Errors: 400 `Validation failed` (over 20 000 chars), 500 `request entity too large` (payload over 100 KB), 429.
  - Note in the docs: messages wait in a queue for up to 24 h until the instance is authorized. So 200 means *accepted*, which matches the spec's ✅.
- **Common errors** (<https://green-api.com/en/docs/api/common-errors/>):
  - 400 also covers `instance is starting or not authorized`, `Instance account is expired`, `bad request data`.
  - 401 = bad token. 403 = bad `idInstance`/URL. 404 = wrong HTTP method. 429 = rate limited.
  - **466** = a plan limit is used up.
  - 499 = the client closed the request. 502 = "retry 3× with delays".
- **466 body** (<https://green-api.com/en/docs/api/466-error-example-body/>): `{ invokeStatus: {method, used, total, status, description}, correspondentsStatus: {…, status: "CORRESPONDENTS_QUOTE_EXCEEDED"} }`.
- **Developer (free) plan** (<https://green-api.com/en/docs/about-tariffs/>): "you can only interact with **3 chats** … per month". **`checkWhatsapp`: 100 requests/month.** Both show up as 466.
- **Rate limits** (<https://green-api.com/en/docs/api/ratelimiter/>): `sendMessage` 50 rps, `checkWhatsapp` 10 rps, `getStateInstance` 1 rps. Going over gives 429.

**Probe with fake credentials** (`curl -i`, `Origin: https://dustyo-o.github.io`, host `7103.api.greenapi.com`, `waInstance7103000000`, token `badtoken`):

- **Preflight** (`OPTIONS`, `Access-Control-Request-Method: POST`, `-Headers: content-type`), for both methods:
  - `200 OK`, `Access-Control-Allow-Origin: *`.
  - `Access-Control-Allow-Methods: GET, POST, OPTIONS, DELETE, HEAD`.
  - `Access-Control-Allow-Headers: DNT,User-Agent,X-Requested-With,If-Modified-Since,Cache-Control,Content-Type,Range`.
  - `Access-Control-Max-Age: 1728000`.
  - **So `Content-Type: application/json` is allowed.**
- **`POST checkWhatsapp`** with a JSON body:
  - `401 Unauthorized`, `Content-Type: application/json`, **`Content-Length: 0`** (empty body, the same as the GETs in spec 002).
  - `Access-Control-Allow-Origin: *`, `Access-Control-Expose-Headers: *`.
  - **`X-RateLimit-Remaining: 9`, `X-RateLimit-Replenish-Rate: 10`.**
- **`POST sendMessage`**: identical, but with **`X-RateLimit-Replenish-Rate: 50`** and `Remaining: 49`. The headers match the documented rps.
- **12 rapid `checkWhatsapp` POSTs**: all 401, no 429 (`Remaining` was 7 afterwards; the bucket refills every second). A human clicking «Начать чат» behind a locked form can't reach 10 rps.
- **Can't be probed with fake credentials:** the auth check (401) runs before validation. Slice 1 needs a real instance (`[User]`) to confirm: the real 200 shape; what a short number returns (`Bad phone number` 400?) when sent as `chatId`; and whether `checkWhatsapp` uses one of the 3 correspondent slots.

## 2. Outcome mapping

**Client changes in `src/api/green-api.ts`:**

- `request()` gets an optional JSON body. When it's given: `method: "POST"`, `headers: { "Content-Type": "application/json" }`, `body: JSON.stringify(...)`.
- Keep the rest: status checked before parsing (401/429 have empty bodies); `TypeError` → `network`; an aborted signal → `timeout`; no token in error messages (`GreenApiError` carries only kind and status).
- `checkWhatsapp(creds, chatId, signal): Promise<{ existsWhatsapp: boolean }>`: throws `badBody` unless `typeof existsWhatsapp === "boolean"`.
- `sendMessage(creds, { chatId, message }, signal): Promise<{ idMessage: string }>`: throws `badBody` unless `idMessage` is a non-empty string.
- Mapping lives in `src/chat/outcomes.ts`, mirroring `src/auth/check-instance.ts`:
  - `checkNumber(creds, chatId, { timeoutMs = 15_000 })` → `"exists" | "notOnWhatsapp" | "checkFailed"`
  - `sendText(creds, chatId, text, { timeoutMs = 15_000 })` → `{ kind: "sent", idMessage } | { kind: "failed" } | { kind: "unknown" }`
  - Each owns an `AbortController` and a timer, like `checkInstance`.

**`checkWhatsapp`:**

| Case | Outcome |
|---|---|
| 200, `existsWhatsapp: true` | `exists` |
| 200, `existsWhatsapp: false` | `notOnWhatsapp` |
| 200 with a bad or missing body | `checkFailed` |
| 400 (any), 401, 403, 404, 466 (100/month quota) | `checkFailed` |
| 429 | `checkFailed`, **no retry** (10 rps can't be reached from a locked form; the message already says «Попробуйте ещё раз») |
| 5xx, `TypeError`, timeout (15 s) | `checkFailed` |

- Only an explicit `existsWhatsapp: false` means "no WhatsApp". Everything else is "couldn't check". See the open question on 400 `Bad phone number`.

**`sendMessage`:**

| Case | Outcome |
|---|---|
| 200 with `idMessage` | `sent(idMessage)` |
| 200 with a bad body / JSON | **`unknown`** (it may have been accepted) |
| **4xx: 400, 401, 403, 404, 429, 466** | **`failed`**: GREEN-API answered and refused, so nothing is queued. 429 doesn't retry; the user has «Повторить». |
| 5xx (500, 502, 503, 504) | **`unknown`**: a gateway error doesn't prove the message wasn't queued |
| `TypeError` (offline, or the connection dropped) | `unknown`. The two can't be told apart, and the spec puts a dropped connection under ❔. |
| Timeout | **15 s** (the same budget as `checkInstance`) → `unknown`. In practice `sendMessage` answers in under a second. |

- Don't add retry-once anywhere in this spec. `withOneRetryOn429` stays private to `check-instance.ts`, so nothing moves.

## 3. Chats store

**A separate store: `src/chat/chats-store.ts`**, Zustand + `persist`, created with `skipHydration: true`. A separate file keeps the session store's tests and persisted shape unchanged.

**Shape:**

```ts
type ChatId = string;                       // "79037474411@c.us"
type MessageStatus = "sending" | "sent" | "failed" | "unknown";
interface Message {
  id: string;                               // crypto.randomUUID() (jsdom 30 implements it; Pages/localhost are secure contexts)
  direction: "out";                         // spec 004 widens to "in" | "out"
  text: string;
  time: number;                             // epoch ms, Date.now() at first send
  status: MessageStatus;
  idMessage?: string;                       // from sendMessage 200
}
interface Chat { id: ChatId; createdAt: number; messages: Message[]; draft: string }
interface ChatsState {
  idInstance: string | null;                // not persisted; null = store closed, all actions no-op
  chats: Record<ChatId, Chat>;
  selectedId: ChatId | null;                // not persisted (placeholder shows after reload)
  open(idInstance): void; wipe(): void;
  addChat(chatId): void;                    // add if missing, then select
  select(chatId): void; setDraft(chatId, text): void;
  send(creds, chatId, text): Promise<void>; // append 🕓, clear draft, await sendText, settle
  retry(creds, chatId, messageId): Promise<void>; // same bubble → "sending" → sendText → settle
}
```

- **Sort order is derived, not stored:** `lastActivity = last message time ?? createdAt`, newest first. A retry keeps the message's time, so it doesn't reorder the list.
- `send` and `retry` take `creds` from the caller (the component reads `useSession`). That avoids a circular import, because `session-store.ts` imports the chats store (see below).
- `settle` finds the message by `(chatId, id)`. If it's gone (a logout happened mid-send), it does nothing.

**Persist key per instance:** `green-api-chat:chats:<idInstance>`.

- `open(idInstance)` calls `useChats.persist.setOptions({ name })`, then `useChats.persist.rehydrate()`, then sets `idInstance`.
- Checked in `node_modules/zustand/esm/middleware.mjs` (v5.0.15): `setItem`, `getItem` and `removeItem` read `options.name` on every call, and `setOptions`, `rehydrate`, `clearStorage` and `skipHydration` are all in `persist.d.ts`.
- `rehydrate` over localStorage finishes synchronously.
- Call it from `session-store.ts` (`resume` and `signIn`) just before `screen: "signedIn"`. No component ever writes before the store is opened.

**Logout:** `signOut()` in `session-store.ts` calls `useChats.getState().wipe()`.

- `wipe()` resets the state to empty with `idInstance: null`, *then* calls `persist.clearStorage()`. The order matters, because every `set` writes to the storage.
- Keys of other instances stay until that instance logs out. That's fine.

**Reload migration 🕓 → ❔:** in persist's **`merge`**, the same place as `session-store.ts`.

- Validate the top level: `chats` must be a plain object, otherwise start empty (corrupt data or another `version` → empty).
- Then map every message with `status === "sending"` to `"unknown"`. This one function is the single place to unit-test.
- `partialize: ({ chats }) => ({ chats })`, `version: 1`.

**Size:** no cap.

- The whole store is stringified on every `set`, including every draft keystroke. That's fine at test-task volumes.
- localStorage is about 5 MB per origin. A single message is at most 20 000 chars (GREEN-API's own limit).
- Leave out: quota handling, pruning, debouncing draft writes.

## 4. Phone module

**`src/chat/phone.ts`:** pure functions, no React.

- **`COUNTRIES`**: a `readonly { id: string; flag: string; name: string; code: string }[]` in the spec's order: `ru` Россия 7, `kz` Казахстан 7, `by` 375, `ua` 380, `uz` 998, `am` 374, `ge` 995, `rs` 381, `tr` 90, `de` 49, `us` 1.
  - The `<select>` value is `id`, not `code`, because RU and KZ share `7`. Add `OTHER = "other"` → «Другая страна».
  - Option label: `` `${flag} ${name} +${code}` ``.
- **`cleanNumber(raw)`** = `raw.replace(/[\s()-]/g, "")`.
- **`isValidNumber(raw)`** = `/^\d+$/.test(cleanNumber(raw))`. Letters left after stripping → invalid → the button stays inactive.
- **`isValidCode(raw)`** = `/^\d+$/.test(raw.trim())`.
  - Render a static `+` before the code field, so users don't type one; a typed `+` makes the code invalid.
  - No stripping of leading zeros and no `8 → 7` (out of scope).
- **`toChatId(code, number)`** = `` `${code}${cleanNumber(number)}@c.us` ``. The "chat already exists" check is `chats[toChatId(...)] !== undefined`, so RU and KZ +7 with the same digits map to one chat.
- **`formatTitle(chatId)`**: `digits = chatId.replace(/@c\.us$/, "")`.
  - If `/^7\d{10}$/` → `+7 XXX XXX-XX-XX` (`+7 903 747-44-11`).
  - Otherwise `+${digits}` (`+381629443720`), including +7 numbers that aren't 10 digits long, since there's no length check.
- **«Другая страна»:** the form shows a `<input inputMode="numeric">` for the code, next to the picker. The code is in component state, not the store.

## 5. Components and files

**Change:**

- **`src/chat/MainScreen.tsx` and its `.module.css`:**
  - Sidebar header: the instance label, then **«+»** (`aria-label="Новый чат"`, toggles the new-chat row), then «Выйти».
  - Sidebar body: `NewChatForm` when open, then `ChatList`.
  - Right area: `Conversation` when `selectedId` is set, otherwise the existing «Выберите чат, чтобы начать переписку».
- **`src/auth/session-store.ts`:** call `useChats.getState().open(id)` on a successful `resume` or `signIn`, and `.wipe()` in `signOut`.
- **`src/api/green-api.ts`:** POST support, `checkWhatsapp`, `sendMessage`.
- **`src/test/green-api-server.ts`:**
  - Extend `Method`. `reply` picks `http.post` for the POST methods.
  - Record request bodies next to `requests`.
  - Add helpers: `whatsappExists(bool)`, `sentAs(idMessage)`.
  - `status`, `unreachable` and `hang` work for the new methods unchanged.
- **`src/index.css`:** new tokens (see §6).

**Add:**

- **`src/chat/NewChatForm.tsx`** and its `.module.css`:
  - A `<form onSubmit>`. Enter in the field submits natively. A disabled submit button blocks implicit submission, which covers "letters → inactive".
  - `<fieldset disabled={checking}>` wraps the picker, the code, the number and the button. That one attribute is the whole lock.
  - The button text switches between «Начать чат» and «Проверяем…».
  - On submit: if the chat exists → `select`. Otherwise `await checkNumber` → `addChat`, or show an error `<p role="alert">` with the exact Russian text.
  - The number is never cleared. The row stays open until «+» is clicked again (the spec says "in every case the number stays").
  - After a logout mid-check, `addChat` is a no-op because `idInstance` is null.
- **`src/chat/ChatList.tsx`** and its `.module.css`:
  - `<ul>` of `<button aria-current={selected}>` showing `formatTitle`, the last text on one line (newlines collapse under `white-space: nowrap`) and `HH:MM`.
  - The empty state is «Нет чатов. Нажмите «+», чтобы начать».
- **`src/chat/Conversation.tsx`** and its `.module.css`:
  - The header shows `formatTitle`, then a scroll area of bubbles, then `Composer`.
  - Scrolling to the newest: a `useEffect` on `[chatId, messages.length]` sets `list.scrollTop = list.scrollHeight`. It doesn't use `scrollIntoView`, which jsdom doesn't implement.
- **`src/chat/MessageBubble.tsx`** (can live inside `Conversation.tsx`): the text with `white-space: pre-wrap`, then `HH:MM` and the mark.

  | Status | Mark | Below the text |
  |---|---|---|
  | `sending` | 🕓 | nothing |
  | `sent` | ✅ | nothing |
  | `failed` | ❗ | «Не отправлено · » + `<button>`«Повторить» |
  | `unknown` | ❔ | «Статус неизвестен · » + `<button>`«Повторить» |

  For `unknown`, the button runs `if (!window.confirm("Сообщение могло уже уйти. Отправить ещё раз?")) return;` before `retry`.
- **`src/chat/Composer.tsx`:**
  - `<textarea rows={1} placeholder="Введите сообщение">` with `value={chat.draft}` and `onChange` → `setDraft`. The draft is per chat and persisted, so there's no local state and no `key` needed.
  - `onKeyDown`: `Enter && !shiftKey && !e.nativeEvent.isComposing` → `preventDefault()`. If `text.trim() !== ""`, call `send(creds, chatId, text.trim())`.
  - No send button.
- **`src/chat/time.ts`:** `formatTime(ms)` = `toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })`.

**Confirm: recommend `window.confirm`.**

- It's zero UI code, natively modal and accessible, and the text is exact.
- RTL: `vi.spyOn(window, "confirm").mockReturnValue(false/true)`. jsdom 30 stubs it as `notImplementedMethodWrapper("confirm")` (`Window.js:917`), so the spy is required.
- Playwright handles it with `page.on("dialog")`.
- The only cost: the Chrome-extension browser tooling must not click it. Use Playwright/verify-ui for that check.
- An inline confirm would add state, two buttons and focus handling. Not worth it here.

## 6. Styling

**New tokens in `src/index.css`** (light / dark):

| Token | Light | Dark |
|---|---|---|
| `--color-chat-bg` | `#efeae2` | `#0b141a` |
| `--color-bubble-out` | `#d9fdd3` | `#005c4b` |
| `--color-item-selected` | `#f0f2f5` | `#2a3942` |
| `--color-item-hover` | `#f5f6f6` | `#202c33` |

- Reuse `--color-text-muted` for time and preview, `--color-danger` for «Не отправлено», `--color-button` for «Повторить».

**Bubble:**

- `align-self: flex-end; max-width: 65%; padding: 6px 8px; border-radius: 8px; background: var(--color-bubble-out); white-space: pre-wrap; overflow-wrap: anywhere;`
- Meta row (`time + mark`) is `font-size: 11px`, muted, right-aligned.
- The «· Повторить» line sits under the bubble, also right-aligned.

**List item:**

- A 2×2 grid: title | time on the first row, preview spanning the second row.
- `text-overflow: ellipsis; white-space: nowrap; overflow: hidden` on the preview. `min-width: 0` on the grid children.
- About 72 px tall, with a bottom border in `--color-border`.

**Composer:** CSS only, no JS:

- `field-sizing: content; max-height: calc(6lh + <vertical padding>); overflow-y: auto; resize: none;`
- `field-sizing` ships in Chrome 123+ and Safari 26.2+ (Dec 2025), which covers the "current Chrome and Safari" targets ([caniuse](https://caniuse.com/mdn-css_properties_field-sizing)). The `lh` unit is in Chrome 109+ and Safari 16.4+.
- Fallback in older browsers: a fixed 1-row textarea that scrolls. That's acceptable.

**Leave out:** bubble tails, the doodle wallpaper, avatars, day separators, unread badges, hover menus, animations, a scroll-to-bottom button, SVG icons (use text «+»), the emoji/attach buttons, and a send button.

## 7. Tests

**Unit:**

- **`src/chat/phone.test.ts`:**
  - `cleanNumber`: `903 747-44-11` and `(903) 747 44 11` → `9037474411`.
  - Validity: letters, empty, only spaces.
  - `isValidCode`: `""`, `+381`, `381`.
  - `toChatId`.
  - `formatTitle`: `79037474411@c.us` → `+7 903 747-44-11`; `381629443720@c.us` → `+381629443720`; a short 7-number stays plain.
- **`src/chat/outcomes.test.ts`** (MSW):
  - Every row of both tables in §2.
  - The request is `POST` with `Content-Type: application/json`, and the body is exactly `{chatId}` or `{chatId, message}`.
  - Hang + `timeoutMs: 50` → `checkFailed` / `unknown`.
  - The token never appears in a thrown error's message.
- **`src/chat/chats-store.test.ts`:**
  - `merge` turns `sending` into `unknown` and keeps `sent`, `failed` and `idMessage`.
  - Corrupt JSON or a wrong shape → empty.
  - Two `idInstance`s write to two keys.
  - `wipe()` removes the key, and a later `set` doesn't recreate it until the next `open`.

**Integration: `src/chat/chats.test.tsx`** (RTL + MSW, the `openPage()` reload pattern from `src/auth/sign-in.test.tsx`, a saved session + `ready()`):

- **§2.1:**
  - The «+» row defaults.
  - `903 747-44-11` → title `+7 903 747-44-11`, at the top, opened.
  - `existsWhatsapp:false` → message, no chat, number kept.
  - 500 and `HttpResponse.error()` → «Не удалось проверить номер…».
  - Existing chat → no `checkWhatsapp` request (assert `requests`) and no duplicate.
  - «Другая страна» `381` + `629443720` → `+381629443720`.
  - Letters → disabled.
  - Gated handler → controls disabled and «Проверяем…».
- **§2.2:** sending in the lower chat moves it to the top with text and time; the empty-list text.
- **§2.3:**
  - 🕓 → ✅ through a gated `sendMessage`, and the box is cleared.
  - 400 → ❗ → «Повторить» → ✅ on the same bubble (one `listitem`).
  - `HttpResponse.error()` → ❔. Then `confirm` → `false` sends nothing; `confirm` → `true` sends again.
  - Shift+Enter → one bubble with two lines.
  - Empty or spaces → no request.
  - Hang → ❔ is covered at unit level with a short timeout, so there's no 15 s wait in RTL.
- **§2.4:**
  - Reload keeps two chats and their marks.
  - A saved `sending` → ❔ after reload.
  - The draft survives a chat switch and a reload.
  - «Выйти» → sign in → empty list, and the storage key is gone.
- **Times:** `vi.useFakeTimers({ toFake: ["Date"] })` plus `vi.setSystemTime`, so `HH:MM` is deterministic. Fake only `Date`, so MSW and promises keep working.

**Not in jsdom:**

- "10 lines → stops at 6 and scrolls" needs layout. Check it in a real browser (verify-ui/Playwright) with a screenshot in `docs/screenshots/`. It isn't `[User]`.

**`[User]`** (needs a real instance and phone):

- Slice 1: the real `checkWhatsapp` true (your second number) and false (a known non-WhatsApp number), plus what a short number returns.
- §2.5: real delivery of «Привет» and ✅.
- Mind the plan limits: **3 correspondents/month and 100 `checkWhatsapp`/month**.

**New dependencies: none.**

## 8. Risks (riskiest first)

1. **The real `checkWhatsapp` contract on the Developer plan.**
   - Unknowns: the actual 200 shape when sent as `chatId`; 400 vs `false` for odd or short numbers; whether a check takes one of the **3 correspondent slots**; the **100/month** check quota (466).
   - Mitigation: **slice 1** = the client functions + mapping + MSW tests, plus a `[User]` real-instance probe (two to three calls, logged in the ledger) before any UI is built.
   - Tests never hit the real API.
2. **The Developer-plan correspondent quota (3 chats/month) breaks real sends with 466.**
   - Example: the reviewer's or the author's instance already used them up. That shows ❗ «Не отправлено» with no reason given.
   - Mitigation: map 466 → `failed`, as the spec allows. Run the §2.5 check against a number already among the 3. Mention it in the README.
3. **A double send from ❔ «Повторить».**
   - Mitigation: the `window.confirm` gate from the spec. 5xx, `TypeError` and timeout map to `unknown`, never to `failed`.
4. **A per-instance key with `skipHydration`.** A `set` before `open()`, or after `wipe()`, writes to the wrong or a stale key.
   - Mitigation: `idInstance === null` makes every action a no-op. `wipe` resets the state before `clearStorage`. A unit test asserts the key is gone after logout.
5. **Enter during IME composition sends half-typed text.** Mitigation: the `isComposing` guard (one condition).
6. **`field-sizing` is missing in older Safari (before 26.2).** It degrades to a scrolling single line, which is acceptable. Verify in current Chrome and Safari.
7. **localStorage quota** (about 5 MB): accepted, and left out.

## Open questions for the lead

- **400 `Bad phone number` on `checkWhatsapp`** (docs: "valid from 11 to 16 digits"). With no length check, a short number like `+7 123` will get this 400.
  - Default above: «Не удалось проверить номер. Попробуйте ещё раз.»
  - Alternative: read the 400 body and show «На этом номере нет WhatsApp» when it says `Bad phone number`. That's more truthful, at about one regex plus a body read.
  - Decide after the slice-1 `[User]` probe shows the real body for a `chatId` request.
- **The new-chat row after success:** the spec says the number stays "in every case", so the row stays open until «+» is clicked again. Confirm that's intended, rather than closing the row when the chat opens.

---
_consult: react-frontend · perms: auto · model: default · 2026-10-06T17:27:26+02:00_

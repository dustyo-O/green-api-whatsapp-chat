<!--
This document describes HOW to build the feature at an architectural level.
It is NOT a copy-paste implementation guide.
-->

# Technical Specification: Chats & Sending

- **Functional Specification:** [functional-spec.md](functional-spec.md)
- **Status:** Draft
- **Author(s):** Alexander Shleyko (lead) · `react-frontend` consult: [consults/](consults/) (`react-frontend-tech-chats-*.md`; GREEN-API docs and fake-credential probes, 2026-10-06)

---

## 1. High-Level Technical Approach

The GREEN-API client gains two JSON POST calls, `checkWhatsapp` and `sendMessage`, each mapped to a small set of outcomes under a 15 s budget. A new Zustand + persist **chats store**, keyed per `idInstance`, holds chats, outgoing messages with status, and per-chat drafts. The session store opens it on sign-in and wipes it on logout. Pure phone helpers handle the country list, cleaning, the chat id and the `+7` display. Four small components (new-chat form, chat list, conversation with bubbles, composer) fill the spec 002 main screen. No new dependencies. Minimal by design (user rule: avoid overengineering).

---

## 2. Proposed Solution & Implementation Plan (The "How")

### 2.1. GREEN-API contracts (docs + fake-credential probes, 2026-10-06)

- **`checkWhatsapp`**:
  - Call: `POST {apiUrl}/waInstance{id}/checkWhatsapp/{token}`, body `{ "chatId": "<code><digits>@c.us" }`. Use `chatId`, not the deprecated numeric `phoneNumber`.
  - 200 body: `{ existsWhatsapp: boolean, … }`. Only `existsWhatsapp` is read; the returned `chatId` (which may be `@lid`) is ignored.
  - Documented errors are all 400, e.g. `Bad phone number` (11–16 digits).
- **`sendMessage`**:
  - Call: `POST …/sendMessage/{token}`, body `{ chatId, message }` (≤ 20 000 chars).
  - 200 body: `{ idMessage }`. That means accepted and queued, not delivered.
  - Errors: 400 (validation), 500 (payload too large), 429.
- **Common errors:**
  - 401 bad token; 403 wrong id/URL;
  - **466 plan limit exhausted**;
  - 5xx gateway errors.
- **Free Developer plan:** **3 correspondents/month** and **100 `checkWhatsapp`/month**; exceeding either returns 466.
- **Rate limits:** `checkWhatsapp` 10 rps, `sendMessage` 50 rps (they match the `X-RateLimit-*` headers).
- **CORS:** the preflight for `POST` + `Content-Type: application/json` returns 200 with `Allow-Origin: *`, and `Content-Type` is in `Allow-Headers`. 401/429 answers have **empty bodies** (same as spec 002), so the status is checked before parsing.

### 2.2. Outcome mapping (`src/chat/outcomes.ts`)

`checkNumber(creds, chatId, {timeoutMs = 15000})` → `exists | notOnWhatsapp | invalidNumber | checkFailed`:

| Case | Outcome |
|---|---|
| 200 `existsWhatsapp: true` | `exists` |
| 200 `existsWhatsapp: false` | `notOnWhatsapp` |
| 400 whose message contains `Bad phone number` or `'chatId' must be` (review 3 F4; the real short-number body, slice-1 probe 2026-10-06) | `invalidNumber` → «Неверный номер. Проверьте код страны и номер.» |
| 200 with a bad or missing body; any other 4xx (incl. 466); 429 (no retry); 5xx; `TypeError`; timeout | `checkFailed` |

The 400 body is read only for `checkWhatsapp`, and only to decide `invalidNumber`. **It is never kept**: GREEN-API's 400 JSON echoes the request `path`, which contains the token (slice-1 probe). The error object stores only the decision.

`sendText(creds, chatId, text, {timeoutMs = 15000})` → `sent(idMessage) | failed | unknown`:

| Case | Outcome |
|---|---|
| 200 with a non-empty `idMessage` | `sent` |
| any 4xx (400, 401, 403, 404, 429, 466): GREEN-API answered and refused | `failed` |
| 200 with a bad body; 5xx; `TypeError` (offline or dropped); 15 s timeout | `unknown` (it may have been queued) |

- No retries in this spec. Spec 002's `withOneRetryOn429` stays private to `check-instance.ts`.
- Errors never carry the token.

### 2.3. Client changes (`src/api/green-api.ts`)

- `request()` gets an optional JSON body. With one, it sends a POST with `Content-Type: application/json`.
- New `checkWhatsapp(creds, chatId, signal)` and `sendMessage(creds, {chatId, message}, signal)`, each with a strict type guard (`badBody` otherwise).

### 2.4. Chats store (`src/chat/chats-store.ts`)

A separate Zustand + `persist` store with `skipHydration: true`:

| Field | Shape |
|---|---|
| `idInstance` | `string \| null` (not persisted; `null` → every action is a no-op) |
| `chats` | `Record<chatId, { id, createdAt, messages: Message[], draft }>` |
| `Message` | `{ id (crypto.randomUUID), direction: "out", text, time (epoch ms), status: sending\|sent\|failed\|unknown, idMessage? }` |
| `selectedId` | `chatId \| null` (not persisted → the placeholder shows after a reload) |

- **Actions:**
  - `open(idInstance)`
  - `wipe()`
  - `addChat(chatId)` (adds if missing, then selects)
  - `select`, `setDraft`
  - `send(creds, chatId, text)`: append 🕓, clear the draft, await `sendText`, settle
  - `retry(creds, chatId, messageId)`: same bubble → 🕓 → `sendText` → settle

  `settle` does nothing if the message is gone (a logout happened mid-send). `creds` are passed in by the caller to avoid a cycle with the session store.
- **Persist:**
  - Key `green-api-chat:chats:<idInstance>` (architecture §2), `version: 1`, `partialize` keeps only `chats`.
  - `open()` sets the key name with `persist.setOptions({name})`, then calls `persist.rehydrate()` (synchronous for localStorage).
  - The session store calls `open` on a successful `resume`/`signIn`, and `wipe` in `signOut`. `wipe` resets the state **before** `persist.clearStorage()`, because every `set` writes.
- **Reload migration 🕓 → ❔:** in persist's `merge`, validate the shape (corrupt or other version → empty), then map `sending` → `unknown`. One pure function, unit-tested.
- **Sort order:** derived, not stored. `lastActivity = last message time ?? createdAt`, newest first. A retry keeps the message's time.
- **Size:** no cap, no pruning, no debouncing of draft writes (test-task volumes; localStorage is about 5 MB).

### 2.5. Phone helpers (`src/chat/phone.ts`, pure)

- `COUNTRIES`: `{ id, flag, name, code }[]` in the spec's order. The `<select>` uses `id`, because RU and KZ share `7`. `other` → «Другая страна».
- `cleanNumber` strips spaces, brackets and dashes. `isValidNumber`: digits only and non-empty. `isValidCode`: digits only and non-empty; a static `+` is rendered before the code field.
- `toChatId(code, number)` → `<code><digits>@c.us`. "Chat exists" = the key is already in `chats`.
- `formatTitle(chatId)`: `^7\d{10}$` → `+7 XXX XXX-XX-XX`; otherwise `+<digits>`.

### 2.6. Components

| Path | Responsibility |
|---|---|
| `src/chat/MainScreen.tsx` (+ css) | sidebar header: instance label, «+» (`aria-label="Новый чат"`), «Выйти»; body: `NewChatForm` (when open) + `ChatList`; right area: `Conversation` or the spec 002 placeholder |
| `src/chat/NewChatForm.tsx` (+ css) | `<form>` + `<fieldset disabled={checking}>` (the whole lock), picker, code field for «Другая страна», number, «Начать чат» / «Проверяем…», error `role="alert"`. Exists → select; else `checkNumber` → `addChat`, or show the error. **The `idInstance` is captured when the check starts; if it has changed by the time the answer arrives (logout, other sign-in), the result is dropped** (review 3 F1). **On success the row closes; on failure the number stays** (functional §2.1 clarified) |
| `src/chat/ChatList.tsx` (+ css) | `<ul>` of buttons (`aria-current`): title, a one-line preview, `HH:MM`; the empty text |
| `src/chat/Conversation.tsx` (+ css) | header title, a scrolling list of bubbles (scroll to the newest on `[chatId, messages.length]` via `scrollTop`), `Composer`, bubbles with the marks: ❗ «Не отправлено · Повторить», ❔ «Статус неизвестен · Повторить» behind `window.confirm("Сообщение могло уже уйти. Отправить ещё раз?")` |
| `src/chat/Composer.tsx` | `<textarea rows=1 maxLength={20000} placeholder="Введите сообщение">` bound to the chat's `draft`; Enter (no Shift, not composing) sends the text **as typed** if `text.trim()` is non-empty (trim only tests emptiness, review 3 F6); no send button |
| `src/chat/time.ts` | `formatTime(ms)` → `HH:MM` (`ru-RU`) |
| `src/auth/session-store.ts` | `open`/`wipe` hooks (above) |
| `src/test/green-api-server.ts` | POST handlers, recorded bodies, `whatsappExists(bool)`, `sentAs(idMessage)` |

**Confirm dialog:** `window.confirm` is zero UI code and natively modal. In tests it's handled with `vi.spyOn(window, "confirm")`.

### 2.7. Styling

- **New tokens (light / dark):**

  | Token | Light | Dark |
  |---|---|---|
  | `--color-chat-bg` | `#efeae2` | `#0b141a` |
  | `--color-bubble-out` | `#d9fdd3` | `#005c4b` |
  | `--color-item-selected` | `#f0f2f5` | `#2a3942` |
  | `--color-item-hover` | `#f5f6f6` | `#202c33` |

- **Bubble:** right-aligned, max 65% wide, `pre-wrap`, an 11 px muted time + mark row.
- **List item:** a 2×2 grid, ellipsis on the preview.
- **Composer auto-grow, CSS only:** `field-sizing: content; max-height: calc(6lh + padding); overflow-y: auto`. That covers Chrome 123+ and Safari 26.2+; older browsers get a 1-row scrolling box, which is acceptable.
- **Left out:** bubble tails, wallpaper, avatars, day separators, unread badges, animations, icons, a send button.

---

## 3. Impact and Risk Analysis

- **System Dependencies:**
  - GREEN-API `checkWhatsapp` and `sendMessage` (new).
  - The spec 002 session store (opens and wipes the chats store) and its main screen (filled in).
  - "Receiving Replies" will widen `Message.direction` to `"in" | "out"`.
- **Potential Risks & Mitigations** (riskiest first; slice 1 takes #1):
  1. **The real `checkWhatsapp` behaviour on the Developer plan.** Unknowns: the 200 shape when sent with `chatId`; a short number → 400 vs `false`; whether a check uses up one of the 3 correspondent slots; the 100/month quota. *Mitigation:* slice 1 = client + mapping + MSW tests, then a `[User]` probe with 2–3 real calls logged in the ledger, **before** any UI.
  2. **The 3-correspondents/month limit** makes real sends fail with 466 → ❗. *Mitigation:* 466 → `failed`; do the real checks with the same one or two numbers; mention it in the README (Phase 3).
  3. **Duplicates from ❔ «Повторить».** *Mitigation:* `window.confirm`; 5xx, `TypeError` and timeout always map to `unknown`, never to `failed`.
  4. **A per-instance key with `skipHydration` writing to a stale key.** *Mitigation:* `idInstance === null` → no-op; `wipe` resets the state before `clearStorage`; a unit test checks the key is gone after logout.
  5. **Enter while an IME is composing** sends half-typed text. *Mitigation:* an `isComposing` guard.
  6. **`field-sizing` in older Safari:** degrades to a scrolling single line (accepted).

---

## 4. Testing Strategy

- **Unit tests:**
  - `phone.test.ts`: cleaning, validity, code, `toChatId`, `formatTitle` incl. a short 7-number staying plain.
  - `outcomes.test.ts` (MSW): every row of both §2.2 tables; POST + JSON content type + exact bodies; hang with `timeoutMs: 50`; no token in errors.
  - `chats-store.test.ts`: the `merge` migration `sending` → `unknown`; corrupt data → empty; two instances → two keys; `wipe` removes the key and no later `set` recreates it.
- **Integration tests** (`chats.test.tsx`: RTL + MSW, the `openPage()` reload pattern from spec 002, `Date`-only fake timers) cover:
  - all of functional §2.1–§2.4, except what needs layout;
  - the existing chat → no `checkWhatsapp` request;
  - ❔ + confirm false/true;
  - the draft surviving a chat switch and a reload;
  - logout → empty list and the key gone.
- **Real browser** (`verify-ui`, Playwright, mocked GREEN-API): the composer stops growing at 6 lines and scrolls. Screenshot to `docs/screenshots/`.
- **`[User]`, real instance:**
  - slice 1 probe: `checkWhatsapp` true for the second number, false for a non-WhatsApp number, and what a short number returns;
  - §2.5: «Привет» → ✅ and it arrives on the phone.
  - Mind the plan limits: 3 chats and 100 checks per month.
- **New dependencies:** none.

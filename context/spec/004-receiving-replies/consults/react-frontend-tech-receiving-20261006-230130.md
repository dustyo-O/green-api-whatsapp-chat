# react-frontend consult — spec 004 Receiving Replies (tech)

_Sources used: GREEN-API docs pages (fetched 2026-10-06 with `curl` and reduced to text): `/en/docs/api/receiving/technology-http-api/ReceiveNotification/`, `…/DeleteNotification/`, `…/notifications-format/incoming-message/Webhook-IncomingMessageReceived/`, `…/incoming-message/{TextMessage,ExtendedTextMessage,QuotedMessage,StickerMessage,ReactionMessage}/`, `…/notifications-format/type-webhook/`, `…/outgoing-message/{OutgoingMessage,OutgoingApiMessage}/`, `/en/docs/api/ratelimiter/`, `/en/docs/api/common-errors/`, `/en/docs/api/account/GetSettings/`, `/en/docs/faq/lid-important-differences/`; the official Python SDK `whatsapp_api_client_python/tools/webhooks.py`; probes with `curl` (below); repo files `src/api/green-api.ts`, `src/chat/{outcomes,chats-store,ChatList,Conversation,MainScreen,phone}.ts(x)`, `src/auth/session-store.ts`, `src/main.tsx`, `src/test/green-api-server.ts`, `src/chat/chats.test.tsx`, `src/auth/sign-in.test.tsx`; `node_modules/zustand/esm/middleware.mjs` (zustand 5.0.15), msw 3.0.2, vitest 5.0.3; spec 003 `tasks.md` (the real `checkWhatsapp` probe)._

## 1. GREEN-API contracts

**ReceiveNotification**
- `GET {apiUrl}/waInstance{id}/receiveNotification/{token}?receiveTimeout={seconds}`. Docs: "receiveTimeout integer No Notification waiting timeout, takes a value from 5 to 60 seconds (default 5 seconds)".
- Empty queue: "The method call ends with an empty response if a timeout is reached." The docs don't show the bytes. The official Python SDK treats any falsy parsed body as empty (`if not response.data: continue`). → **Parse `""` and `null` as "empty"**. Today `request()` throws `badBody` on an empty body, so it needs an `allowEmpty` path. The exact bytes are confirmed in slice 1 (see §7).
- 200 body: `{ receiptId: integer, body: <notification> }`: "receiptId integer Receipt Id for deleting an incoming notification by DeleteNotification method".
- Queue: "Incoming notifications are stored in the queue for 24 hours. Notifications are sent from the queue in FIFO order". The head stays until it is deleted: "the next call of ReceiveNotification method will return the next notification" only after DeleteNotification.
- Error body example: `{"code":"INVALID_PARAM","message":"Message cannot be received because custom webhook url is set…","status":"error"}` (400). The sign-in readiness check already excludes this case.

**DeleteNotification**
- `DELETE {apiUrl}/waInstance{id}/deleteNotification/{token}/{receiptId}`.
- 200 `{ "result": true }`. `false` = "possible, if the notification was deleted earlier or receiptId doesn't correspond…". Errors: 400 `Parameter receiptId must be a Number!`; **500** `Cannot read properties of undefined (reading 'findUnAckedMessage')` = "The message you tried to delete was not found".
- → Treat `result: false`, 200 and 500 as "done, move on". Only a network error or 429 is worth a retry (see §2).

**`incomingMessageReceived` body**
- Top level: `typeWebhook`, `instanceData {idInstance, wid, typeInstance}`, `timestamp` ("Event timestamp in UNIX format" = **seconds**, e.g. `1588091580`), `idMessage` (string), `senderData`, `messageData`.
- `senderData` (the complete documented table): `chatId` ("Chat Id, where a message or file has been received"), `sender`, `chatName`, `senderName` ("Sender name"), `senderContactName` ("Sender name according to the contact list of the current account"). **There is no `senderPhoneNumber`, `senderLid` or `chatLid` field** on the webhook page or in the `@lid` FAQ.
- `messageData.typeMessage` (webhook page list): `textMessage | imageMessage | videoMessage | documentMessage | audioMessage | locationMessage | contactMessage | extendedTextMessage | quotedMessage | pollMessage | pollUpdateMessage | editedMessage | deletedMessage | orderMessage | productMessage`. Separate pages add `stickerMessage`, `reactionMessage`, contacts array, buttons, list, template, group invite and interactive types.
- Text locations:
  - `textMessage` → `messageData.textMessageData.textMessage`;
  - `extendedTextMessage` → `messageData.extendedTextMessageData.text`;
  - `quotedMessage` (a reply quoting a message) → `messageData.extendedTextMessageData.text` ("Text message below quoted").
  - **Trap:** `reactionMessage` also carries `extendedTextMessageData: { "text": "👍" }`. Switch on `typeMessage`; never read the text from "whichever field exists".

**The key question: `@lid` vs `@c.us`** (FAQ "Important differences in using a lid instead of a telephone number"; it is marked "Beta version … may also work unstably")
- Default: "All message sending methods, chat ID, journals methods, and webhooks use the @c.us prefix for backward compatibility."
- `@lid` arrives **only when the instance opts in**: "Receiving journals and webhooks with @lid — Beta version … Currently, receiving @lid via journals and webhooks is not guaranteed. In your account, set the Use chat IDs field to yes … Alternatively, use the SetSettings method and set the EnableLidMode field to yes. To apply the settings, you need to log out of your instance and then re-authorize it … If all settings are applied, the chatId and senderId fields … will contain the @lid number, unique for each instance." The `getSettings` doc lists `enableLidMode string … Possible values: yes, no`.
- Example `@lid` webhook from the FAQ: `"senderData": {"chatId": "155508384256027@lid", "sender": "155508384256027@lid", "senderName": "John", "senderContactName": "", "chatName": "John Doe"}`.
- **The phone number is NOT available in another field** of a lid-mode webhook. The only related sentence is "Currently, the user's phone number will be included in journals and webhooks, even if sent via @lid", and it refers to **sending** via `@lid` without lid mode.
- A lid can change, rarely ("on an account with 100 chats, it may affect one chat"). The new one is visible only through `newChatId` in GetChats/GetContacts. Out of scope: messages sent to the old lid are still delivered.
- **Repo evidence:** the user's real `checkWhatsapp` probe (spec 003 `tasks.md`) returned `{"existsWhatsapp":true,"chatId":"<n>@lid","phoneNumber":"<n>@c.us",…}`. So `checkWhatsapp` exposes the number→lid pair. Whether the user's instance has `enableLidMode = yes` is **unknown**. See §7 R1.

**Outgoing and other notification types to skip** (type-webhook page): `outgoingMessageReceived` (typed on the phone), `outgoingAPIMessageReceived` (our own `sendMessage`, echoed back), `outgoingMessageStatus`, `stateInstanceChanged`, `statusInstanceChanged`, `deviceInfo`, `incomingCall`, `outgoingCall`, `incomingBlock`, `quotaExceeded`. Rule: **anything whose `typeWebhook !== "incomingMessageReceived"` → delete and skip.**

**`sendMessage` to `@lid`:** yes. FAQ "Send messages by @lid": `{"chatId": "120650379300963@lid", "message": "Hello, John Doe"}`. The spec 003 400 text also names the format: `'chatId' must be one of the next formats: 'phone_number@c.us' or 'chat_id@lid'`. The Composer needs no change.

**Rate limits** (`/docs/api/ratelimiter/`, per instance): `receiveNotification 100` rps, `deleteNotification 100` rps (compare `getStateInstance 1`, `sendMessage 50`). Over the limit → 429.

**Probes** (fake credentials, `Origin: https://dustyo-o.github.io`, host `7103.api.greenapi.com`, id `7103000001`, 2026-10-06 21:03 UTC):
- `GET …/receiveNotification/<FAKE>?receiveTimeout=5` → `401 Unauthorized`, `Content-Type: application/json`, `Content-Length: 0`, `Access-Control-Allow-Origin: *`, `Access-Control-Expose-Headers: *`, `X-RateLimit-Remaining: 99`, `X-RateLimit-Replenish-Rate: 100`. It answered immediately (auth is checked before the long poll).
- `OPTIONS …/deleteNotification/<FAKE>/1` with `Access-Control-Request-Method: DELETE` → `200`, `Access-Control-Allow-Methods: GET, POST, OPTIONS, DELETE, HEAD`, `Access-Control-Max-Age: 1728000`.
- `DELETE …/deleteNotification/<FAKE>/1` → `401`, empty JSON body, the same CORS and rate-limit headers (`Remaining: 99`).
- `DELETE …/deleteNotification/<FAKE>/abc` → `401`, so auth is checked before receiptId validation (`Remaining: 98`).
- Conclusions:
  - CORS is fine for GET and DELETE.
  - 401 has an empty body, which the existing status-first rule in `request()` already handles.
  - The rate-limit headers confirm 100/s for both methods.
  - The real empty-queue and notification bodies can't be probed without real credentials.

## 2. The receive loop

- **Where:**
  - `src/api/green-api.ts`: `receiveNotification(creds, receiveTimeoutS, signal) → {receiptId:number, body:unknown} | null` and `deleteNotification(creds, receiptId, signal) → void`.
  - Extend `request()` minimally with a path suffix (`?receiveTimeout=20`, `/<receiptId>`), `DELETE` and `allowEmpty`.
  - Error bodies are never read, so the token echoed in 400 bodies can't leak.
  - `src/chat/notification.ts`: a **pure** `toIncoming(body) → Incoming | null` (see §3).
  - `src/chat/receive-loop.ts`: `runReceiveLoop(creds, signal)`.
  - Started by a `useEffect` in `MainScreen.tsx`.
- **Start/stop:**
  - `MainScreen` is mounted exactly while `screen === "signedIn"`, which is after `open()` (resume or sign-in).
  - `useEffect(() => { const c = new AbortController(); void runReceiveLoop(credentials, c.signal); return () => { c.abort(); }; }, [credentials])`.
  - Logout → `wipe()` → `screen: "signedOut"` → unmount → abort.
  - Inside the loop, capture `useChats.getState().session` at start. Before **saving** and before **deleting**, stop if `signal.aborted || session changed`. A notification received just before logout is then neither saved nor deleted; it stays queued for the next sign-in.
  - All store actions already no-op on `idInstance === null`.
- **One at a time:**
  - `receive` → `toIncoming(body)` → if a message, `useChats.getState().receive(...)` (a synchronous `set`, so it is persisted) → `delete(receiptId)` → loop.
  - Null body → loop immediately (the server already waited `receiveTimeout`).
  - Verified write-before-acknowledge: zustand 5.0.15 `persist` wraps `set` as `set(...); return setItem()`, and `setItem` calls `storage.setItem` synchronously for `createJSONStorage(() => localStorage)`. The localStorage write has happened when `set` returns.
- **Timeouts:** `receiveTimeout=20` (architecture §4). Client budget = receiveTimeout + 10 s = **30 s**. Use the `withBudget` setTimeout pattern from `outcomes.ts`, also linked to the loop's signal. Don't use `AbortSignal.timeout`/`any`, because vitest fake timers don't drive them. Delete budget: 15 s, like sends.
- **Backoff** on network errors, the budget timeout, 429, 5xx, 400 (e.g. "instance in starting process") and `badBody` alike:
  - wait **1 s → 2 s → 4 s → 5 s cap**, retry forever, and reset to 1 s after any successful receive;
  - the wait is an abortable sleep, so logout cancels it;
  - **Deviation from architecture §4 "up to about 30 s":** criterion §2.4 c4 ("within 10 s" after a 30-s outage) can't hold with a cap above about 5 s plus a 20-s poll that has to be started. At 5 s that is about 0.2 rps against a 100 rps limit. The architecture line should be amended.
- **401/403:** no banner yet (Phase 2). **Treat them like any other failure** (5-s capped retry). It costs nothing at 0.2 rps, and the loop recovers by itself if the instance is re-authorized. Stopping would silently kill receiving until a reload. Phase 2 hangs the banner off the same error classification.
- **Failed delete:**
  - network or 429 → back off, then **go back to `receive`**, not to the delete. The undeleted head comes back, is handled again (dedupe absorbs it, and a skip is a skip) and is deleted again;
  - 200 `result:false`, 500 "not found" or any other HTTP answer → move on (it is gone, or will never succeed);
  - one generic path, no delete-retry state.
- **A body without a numeric `receiptId`:** treat it as `badBody` → backoff. Nothing can be deleted, so there is nothing else to do; this would be a GREEN-API bug.
- **Avoiding two loops:**
  - The effect cleanup aborts the old loop. Under StrictMode, mount → cleanup → mount aborts the first `fetch` before it can answer, so at most one loop handles notifications.
  - A brief duplicate `receiveNotification` is harmless at 100 rps (unlike the 1-rps `getStateInstance` that forced `resume()` out of effects).
  - Re-sign-in remounts with new credentials, and the session check covers the gap.
  - Multi-tab stays Phase 2 (Web Locks).
- **Why an effect and not a module-level start from `session-store`:** the tests reload `main.tsx` with `vi.resetModules()`. A module-level loop from an earlier module instance would keep polling forever. An effect is torn down by RTL `cleanup()` after every test.

## 3. Mapping a notification to a chat and message

`toIncoming(body)` returns `{ chatId, idMessage, time, text: string | null, name?: string } | null`. `null` = delete and skip.
- **Skip:**
  - `typeWebhook !== "incomingMessageReceived"`;
  - `senderData.chatId` not matching `/^\d+@(c\.us|lid)$/` (drops `@g.us` groups, `status@broadcast`, `@newsletter` and anything new);
  - a missing or empty `idMessage`, or a non-number `timestamp`;
  - **recommended:** `typeMessage ∈ {reactionMessage, editedMessage, deletedMessage, pollUpdateMessage}`. These are changes to earlier messages, not replies, and the spec puts "reactions, edits or deletions" out of scope. A placeholder for a 👍 would claim "the contact replied". → Open question 2.
- **Text:**
  - `textMessage` → `textMessageData.textMessage`;
  - `extendedTextMessage` and **`quotedMessage`** → `extendedTextMessageData.text` (a quoted reply is a text reply; Open question 3);
  - if the expected string is missing → treat as a placeholder (never drop).
- **Placeholder:** any other type → `text: null`. The UI renders «Сообщение этого типа пока не поддерживается».
- **Chat key:** `senderData.chatId` as is.
  - `@c.us` = `<digits>@c.us`, **exactly the key `toChatId()` builds in spec 003**, so a reply from a number the user started a chat with lands in that chat with no extra code.
  - `@lid` → its own chat keyed by the lid. Same sender → same key → same chat; two hidden senders → two chats.
  - Without lid mode, `@lid` should not appear at all (§1).
- **Title for `@lid`:** `name = senderName || senderContactName || chatName`, trimmed. Empty → no title → the UI shows «Неизвестный номер».
  - Store it as `chat.title` and refresh it whenever a later notification carries a non-empty name.
  - `@c.us` chats ignore `title` and keep `formatTitle(id)`, as the spec asks for the number.
- **Dedupe:** skip if any message in that chat has the same `idMessage`. Incoming ids can't collide with outgoing ids, which come from `sendMessage`. Per chat, per architecture §2.
- **Time:** `timestamp * 1000`. **Ordering:** insert after the last message with `time <= new.time` (ties keep arrival order). `messages.at(-1)` then stays the newest, so `lastActivity`/`sortChats` and the preview already give criterion F6 (a late 09:00 reply doesn't move B above A and doesn't change B's preview).
  - Accepted skew: outgoing times are the local clock, incoming times are server time. A fast local clock can place a reply above the message it answers. Not worth handling.
- **Unread:** `unread += 1` when the chat isn't `selectedId` at receive time (so a backlog after sign-in counts everything, because `open()` resets `selectedId`). `select`/`addChat` set it to 0.
- **Persisted:** the message (`id = crypto.randomUUID()`, `direction:"in"`, `idMessage`, `time`, `text|null`), `unread` and `title`. Everything lives under the existing per-instance key `green-api-chat:chats:<id>`, written by the existing `partialize: ({chats})`.

## 4. Store changes (`src/chat/chats-store.ts`)

- **Types:** make `Message` a union.
  - `OutMessage = { id; direction:"out"; text; time; status; idMessage? }` (unchanged shape);
  - `InMessage = { id; direction:"in"; text: string | null; time; idMessage: string }`, no status;
  - TypeScript then forces `Conversation`'s status marks and retry to narrow on `direction`.
- **`Chat`:** add `unread: number` and `title?: string`.
- **`receive(incoming: Incoming): void`** (synchronous):
  - no-op if `idInstance === null`;
  - create the chat if it is missing (`createdAt: Date.now()`, `messages: []`, `draft: ""`, `unread: 0`);
  - dedupe, sorted insert, `unread` and `title` as in §3;
  - one `set`.
- **`select(chatId)` / `addChat(chatId)`:** also set `unread: 0` on that chat.
- **`merge`/`restoreChats` validation (keep `version: 1`):**
  - `isMessage` accepts `direction:"out"` (as now) **or** `direction:"in"` with `typeof idMessage === "string"` and `text` a string or `null`;
  - `isChat` accepts `unread` missing (spec 003 data) or a non-negative number, and `title` missing or a string;
  - restore maps a missing `unread` → `0`;
  - the `sending → unknown` mapping applies to out messages only.
  - **Don't bump `version`:** verified in zustand 5.0.15 `middleware.mjs` L392–404, a stored version ≠ `options.version` without `migrate` logs "couldn't be migrated since no migrate function was provided" and hydrates nothing. `merge` would get `undefined` and wipe the user's spec 003 chats. Lenient validation is the migration.
- **Sorting:** already derived. `sortChats` uses `lastActivity = messages.at(-1)?.time ?? createdAt`, which stays correct with sorted insertion. No change.

## 5. UI changes

- **`Conversation.tsx` + `.module.css`:**
  - `.messages` currently has `align-items: flex-end` (everything right-aligned). Add `.in { align-self: flex-start; background: var(--color-bubble-in); }`.
  - Incoming bubbles render `formatTime(time)` without a mark or retry.
  - Placeholder (`text === null`): `.unsupported { color: var(--color-text-muted); font-style: italic }` with the exact text «Сообщение этого типа пока не поддерживается», from one constant shared with the list preview. The "grey bubble" is the muted italic text in the in-bubble, which avoids a third background token. If the lead wants a grey background, add `--color-bubble-unsupported`.
  - Header: `chatTitle(chat)` instead of `formatTitle(chatId)`.
- **`ChatList.tsx`:**
  - title via `chatTitle(chat)`;
  - preview = text, or the placeholder string for `null`;
  - badge `<span className={styles.badge} aria-label={`${n} непрочитанных`}>{n}</span>` when `unread > 0`, in the grid under the time (`grid-column: 2`, green pill `background: var(--color-badge); color: var(--color-badge-text); border-radius: 10px; min-width: 20px; font-size: 0.75rem; text-align: center`);
  - clearing happens in `select`.
- **`phone.ts`:** `chatTitle(chat) = chat.id.endsWith("@lid") ? (chat.title ?? "Неизвестный номер") : formatTitle(chat.id)`. `formatTitle` stays for `@c.us`.
- **Scroll:** the existing effect `[chatId, messages.length]` already scrolls to the bottom whenever a message is added, including an incoming one (the 2.1 c3 criterion is met as is). A late reply inserted mid-list also scrolls to the bottom, which keeps the newest in view.
- **New tokens in `src/index.css`** (light / dark, WhatsApp Web values):
  - `--color-bubble-in: #ffffff / #202c33`;
  - `--color-badge: #25d366 / #00a884` (WA uses `#25d366` light);
  - `--color-badge-text: #ffffff / #111b21`.

## 6. Tests (Vitest + RTL + MSW only)

- **`src/test/green-api-server.ts`:**
  - Add `receiveNotification` (GET, URL `*/receiveNotification/*`) and `deleteNotification` (DELETE `*/deleteNotification/*/*`).
  - **Default handler is required:** once `MainScreen` polls, **every existing signed-in test** (`chats.test.tsx`, `sign-in.test.tsx`, `App.test.tsx`) fires `receiveNotification`, and `server.listen({onUnhandledFrame:"error"})` turns that into failures. Pass a default "empty queue that waits until aborted" handler to `setupServer(...)` so `resetHandlers()` keeps it.
  - Record receive/delete in their own arrays (`received`, `deleted: number[]`) and **not** in `requests`. Existing assertions such as `expect(requests).toEqual(["getStateInstance","getSettings"])` (`sign-in.test.tsx` L286/L357) then stay valid.
  - `queue(...answers)`: each receive takes the next answer, either a `{receiptId, body}` fixture, `null`, `status(429)` or `HttpResponse.error()`. When the queue is exhausted it falls back to the "wait until aborted" default.
  - A DELETE handler pushes the receiptId, answers `{result:true}`, and also **pops the head** (a real FIFO). With a failed delete the head stays, so redelivery is modelled for free.
- **Fixtures** (`src/chat/notification.fixtures.ts`), built from the doc examples: text, extended, quoted, sticker, `@lid` with and without a name, group (`120363369140947676@g.us`, from the sticker page), `outgoingMessageReceived`, `outgoingAPIMessageReceived`, `outgoingMessageStatus`, `reactionMessage`.
- **Unit:**
  - `notification.test.ts`: table over the fixtures → `toIncoming` result, including the reaction trap and `timestamp*1000`.
  - `chats-store.test.ts`: dedupe, sorted insert, ties, unread/selected, title refresh, merge of spec 003 data without `unread`, a bad `direction` → `{}`, and `version` stays 1.
  - `green-api` client: URLs (`?receiveTimeout=20`, `DELETE …/42`), `null`/`""` → `null`, 401 empty body, no token in thrown errors.
- **Loop** (`receive-loop.test.ts` against the store, no UI):
  - saved before delete: in the DELETE handler, assert `localStorage[key]` already contains the `idMessage`;
  - a skip is still deleted;
  - redelivery after a failed delete → one message;
  - abort stops it (no further requests, no save after abort);
  - backoff: `vi.useFakeTimers({ toFake: ["setTimeout","clearTimeout"] })` + `vi.advanceTimersByTimeAsync` (precedent: `sign-in.test.tsx` L362–373). Assert no retry at 999 ms, a retry at 1 s, then 2 s, 4 s, 5 s, 5 s, and a reset after success.
- **RTL + MSW, one per criterion** (`src/chat/receiving.test.tsx`, `loadPage()` pattern from `chats.test.tsx`):

| Criterion | Test |
|---|---|
| 2.1 c1 | Open the RU chat, queue «Привет-привет» → `findByText` in a bubble with class/role "in" and `formatTime` |
| 2.1 c2 | Ordering by time (stored out at 10:00, incoming ts 10:01) |
| 2.1 c3 | `scrollTop === scrollHeight` after an incoming message (as spec 003's scroll test) |
| 2.2 c1–c6 | Badge «2», moves to top, cleared on open; unknown number → new chat + «1»; `@lid` «Иван»; «Неизвестный номер»; two lids + repeat; late 09:00 stays below |
| 2.3 c1–c3 | Placeholder bubble; group → nothing, then text still appears; `outgoingMessageReceived` → nothing |
| 2.4 c1 | Reload (`loadPage()` again) → each once, in order |
| 2.4 c2 | Backlog in the queue before sign-in → appears with its time |
| 2.4 c3 | The same `idMessage` twice → once |
| 2.4 c4 | Fake timers: `HttpResponse.error()` ×N then the text → appears after the backoff step ≤ 5 s |
| 2.4 c5 | Group + sticker first, then «Текст» |
| 2.4 logout | After «Выйти», no further `received` entries and the queued message isn't saved |

- **Stays `[User]`:**
  - 2.5 (a real phone reply, TKT-5);
  - the "within 10 s over 5 consecutive replies" timing and "≤ 30 s for 20 backlog replies" on a real instance;
  - the real empty-queue bytes and `@lid` behaviour (§7 R1/R2).
  - The 10 s in tests is shown structurally (an immediate render on receive, a 5-s backoff cap), not by wall-clock.
- **RED proof** per test as usual (e.g. drop the delete → queue stalls; delete before save → localStorage assertion fails; `version: 2` → spec 003 data test fails).

## 7. Risks (riskiest first)

1. **R1 — `@lid` mode splits a known contact into a second chat.**
   - If the user's instance has `enableLidMode = yes` (possible: the real `checkWhatsapp` already answers `chatId: "<n>@lid"`), a reply from a number the user started as `79…@c.us` arrives as `…@lid`. It lands in a **new** «Иван»/«Неизвестный номер» chat, which breaks 2.1 c1 ("in the chat with +7 903…") for the main demo flow.
   - **Slice 1 must settle it:** a `[User]` check of `enableLidMode` in the console (or a read-only `getSettings`; no new calls in code needed) **plus one real reply**, read from `receiveNotification` with `curl` (which also gives R2's empty-queue bytes and a real body). It needs a linked phone, which ties to TKT-5.
   - Mitigations, cheapest first:
     - (a) keep or set `enableLidMode = no` (the default; it needs a re-auth in the console) and document it in the README next to the existing "no webhook URL" setup note;
     - (b) if lid mode must stay on, store the `chatId` that `checkWhatsapp` returns as `chat.lid` when the user creates a chat, and map an incoming `@lid` to the chat that holds it. That is about 10 lines (`checkNumber` already has the body), but it is new spec surface. Only if (a) is rejected.
2. **R2 — The empty-queue body shape.** The docs say "empty response" and the SDK checks falsiness. If it's `""`, today's `request()` would throw `badBody` every 20 s, and the loop would back off forever while looking "fine". Mitigation: `allowEmpty` handles `""` and `null`; a unit test covers both; the slice 1 `curl` confirms.
3. **R3 — Existing test suites break when polling starts** (unhandled-request errors, `requests` equality assertions). Mitigation: the default MSW receive handler plus separate `received`/`deleted` arrays, landed in the **same commit** as the loop.
4. **R4 — Loop leaks:** StrictMode double mount, logout races, module reloads in tests. Mitigation: effect-owned `AbortController`, the session check before save and delete, store no-ops on `idInstance === null`. Tests: logout mid-poll and abort mid-backoff.
5. **R5 — Head-of-line blocking:** a notification the parser throws on, or one with no `receiptId`. Mitigation: `toIncoming` never throws (a typed guard; unknown shape → skip), and every receive is followed by a delete whatever the outcome. Test 2.4 c5 plus a "garbage body" row.
6. **R6 — The 10-s-after-reconnect promise vs architecture's 30-s backoff cap.** Mitigation: a 5-s cap (§2); amend architecture §4.
7. **R7 — Multi-tab duplicates** (two tabs both poll and save, and each tab's localStorage write can overwrite the other's). Accepted by the spec until Phase 2 Web Locks.
8. **R8 — Placeholder for reactions/edits/deletions** if they aren't skipped (spurious "replies"). Mitigation: the skip list in §3 (Open question 2).

## Open questions for the lead

1. **R1:** ask the user to check `enableLidMode` (console "Use chat IDs") on their instance. Then pick mitigation (a) (keep it `no` + README note) or (b) (store the `checkWhatsapp` lid on the chat). I recommend (a).
2. Skip `reactionMessage`, `editedMessage`, `deletedMessage` and `pollUpdateMessage` instead of showing the placeholder? The spec (§2.3 "or other non-text reply") and architecture §4 ("any other type → placeholder") read literally would show a placeholder for a 👍. I recommend skipping them and adding one line to architecture §4.
3. Treat `quotedMessage` (a reply that quotes an earlier message) as text, showing `extendedTextMessageData.text` without the quote? I recommend yes. Otherwise a normal "reply to" message shows as «Сообщение этого типа пока не поддерживается».
4. Architecture §4 "exponential backoff up to about 30 s": change it to a 5-s cap for receiving, so criterion 2.4 c4 can hold.

---
_consult: react-frontend · perms: auto · model: default · 2026-10-06T23:01:30+02:00_

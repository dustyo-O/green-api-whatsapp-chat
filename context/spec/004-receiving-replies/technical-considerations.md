<!--
This document describes HOW to build the feature at an architectural level.
It is NOT a copy-paste implementation guide.
-->

# Technical Specification: Receiving Replies

- **Functional Specification:** [functional-spec.md](functional-spec.md)
- **Status:** Draft
- **Author(s):** Alexander Shleyko (lead) · `react-frontend` consult: [consults/](consults/) (`react-frontend-tech-receiving-*.md`; GREEN-API docs, the Python SDK, fake-credential probes, 2026-10-06)

---

## 1. High-Level Technical Approach

A receive loop polls GREEN-API's notification queue one notification at a time: `receiveNotification` (20 s long poll), then handle, save, then `deleteNotification`. It runs while the main screen is mounted and is cancelled by an `AbortController` on unmount or logout. A pure `toIncoming()` turns a notification into a message or a skip. The chats store gets a `receive()` action (dedupe by `idMessage`, time-sorted insert, an unread count, a title for hidden-number chats). The UI adds left-hand incoming bubbles, a placeholder bubble and an unread badge. No new dependencies. Tests: Vitest + RTL + MSW only.

---

## 2. Proposed Solution & Implementation Plan (The "How")

### 2.1. GREEN-API contracts (docs + probes, 2026-10-06)

- **`receiveNotification`:**
  - Call: `GET {apiUrl}/waInstance{id}/receiveNotification/{token}?receiveTimeout=20` (allowed range 5–60 s).
  - An empty queue gives an **empty response**: treat both `""` and `null` as "nothing". The exact bytes get confirmed in slice 1.
  - A notification comes back as `{ receiptId: number, body }`.
  - The queue is FIFO, and its head stays until it's deleted. Notifications are kept for 24 h.
- **`deleteNotification`:**
  - Call: `DELETE …/deleteNotification/{token}/{receiptId}`.
  - Success is 200 `{result:true}`. `result:false` and a 500 "not found" both mean it's already gone.
- **Rate limits:** 100 rps for both methods (confirmed by the `X-RateLimit-*` headers).
- **CORS and errors:** CORS is fine for both GET and DELETE. A 401 has an empty body, which the existing status-first rule already handles. Error bodies are never read, because they echo the token.
- **The `incomingMessageReceived` notification:**
  - Top-level fields: `typeWebhook`, `idMessage` (string), `timestamp` (**seconds**), `senderData {chatId, sender, senderName, senderContactName, chatName}`, `messageData.typeMessage`.
  - Where the text is: `textMessage` → `textMessageData.textMessage`; `extendedTextMessage` **and `quotedMessage`** → `extendedTextMessageData.text`.
  - **Trap:** `reactionMessage` also carries `extendedTextMessageData.text` ("👍"), so the type is always switched on `typeMessage`, never on whichever field happens to exist.
- **`@lid` vs `@c.us`:**
  - Webhooks use `…@c.us` (the number) unless the instance enables lid mode (**"Use chat IDs" / `enableLidMode`**).
  - In lid mode the number isn't available in any field.
  - **The user's instance has it off** (console, 2026-10-06), so replies carry the number and match the chat started by number.
  - The README (Phase 3) tells reviewers to keep it off.
  - `@lid` chats are still handled (keyed and titled) in case a reviewer has it on. `sendMessage` accepts `…@lid`, so such chats can be replied to with no Composer change.

### 2.2. Client (`src/api/green-api.ts`)

- `request()` gains a path suffix (`?receiveTimeout=20`, `/<receiptId>`), the `DELETE` method, and an `allowEmpty` option (`""`/`null` → `null` instead of `badBody`).
- `receiveNotification(creds, receiveTimeoutS, signal)` returns `{receiptId, body} | null`. A body without a numeric `receiptId` throws `badBody`.
- `deleteNotification(creds, receiptId, signal)` returns `void`.

### 2.3. Notification mapping (`src/chat/notification.ts`, pure)

`toIncoming(body)` returns `{ chatId, idMessage, time, text: string | null, name? }`, or `null`, which means delete and skip. It never throws.

**Skipped:**
- `typeWebhook !== "incomingMessageReceived"`. This covers messages typed on the instance phone, our own API sends echoed back, statuses, state changes and calls.
- A `chatId` that isn't `^\d+@(c\.us|lid)$`. This drops groups `@g.us`, `status@broadcast` and newsletters.
- A missing `idMessage` or a non-numeric `timestamp`.
- `typeMessage` ∈ {`reactionMessage`, `editedMessage`, `deletedMessage`, `pollUpdateMessage`}. These change earlier messages and aren't replies (functional §3: reactions, edits and deletions are out of scope; decided by the lead from the consult, open question 2).

**Kept:**
- **Text:** the three text types above. If the expected string is missing, the message becomes a placeholder instead.
- **Placeholder:** any other type → `text: null`, rendered as «Сообщение этого типа пока не поддерживается».
- **Time:** `timestamp × 1000`.
- **Name:** the first non-empty of `senderName`, `senderContactName`, `chatName`. It's only used to title `@lid` chats.

### 2.4. Receive loop (`src/chat/receive-loop.ts`)

- **Started by** a `useEffect` in `MainScreen.tsx`, which is mounted exactly while signed in, after `open()`. It creates an `AbortController` and calls `runReceiveLoop(creds, signal)`; the effect's cleanup aborts it. A module-level start would leak across `vi.resetModules()` in tests.
- **Cycle:**
  1. `receive` with a 30 s budget (20 s long poll + 10 s), using the existing `withBudget` setTimeout pattern.
  2. `null` → loop again.
  3. `toIncoming` → if it's a message, `useChats.getState().receive(...)`. This is a synchronous `set`, so localStorage is written before the call returns.
  4. `deleteNotification` (15 s budget), then loop.
- **Session guard:** the loop captures the chats-store session counter when it starts. Before **saving** and before **deleting**, it stops if the signal is aborted or the session has changed. A notification received just before logout is then neither saved nor deleted, and stays queued for the next sign-in.
- **Backoff** on network errors, a budget timeout, 429, 5xx, any 4xx incl. 401/403, and `badBody`:
  - 1 s → 2 s → 4 s → **5 s cap**, retrying forever;
  - reset to 1 s after any successful receive;
  - the sleep is abortable.
  - The 5 s cap amends architecture §4's "about 30 s" (open question 4), so functional §2.4 c4 can hold ("within 10 s after reconnect").
  - 401/403 don't stop the loop: no banner until Phase 2, and the loop recovers by itself if the instance is re-authorized.
- **Delete outcomes (review 3 F3):**
  - **Deleted:** 200 `{result:true}`, 200 `{result:false}` (already gone), or the documented 500 "not found" → move on.
  - **Anything else** (network, timeout, 429, other 4xx/5xx) → back off, then go back to `receive`. The undeleted head comes back, and dedupe absorbs it.
  - **The backoff resets only after a successful delete**, never after re-receiving the same head, so a delete that keeps failing waits 1 → 2 → 4 → 5 s and never loops hot.
- **Reconnect (review 3 F2):** a `window` `online` listener (added and removed with the loop) cancels the current backoff sleep **and** any in-flight request, then polls immediately. Replies sent during an outage then appear within one poll of the connection coming back, instead of after a stalled request's remaining budget.
- **Unacknowledgeable envelopes (review 3 F4):** a notification with a numeric `receiptId` is always deleted, whatever its body. A receive answer **without** a `receiptId` can't be deleted by anyone (a GREEN-API fault): the loop backs off (5 s cap) and retries, and receiving is effectively stuck. The visible "receiving is stuck" state is **deferred to roadmap Phase 2 "Connection & Authorization States"**, which reuses the loop's error classification.
- **Two loops:** the effect cleanup aborts the previous one. Under StrictMode, the first `fetch` is aborted before it can answer, and a duplicate receive is harmless at 100 rps. Multi-tab is Phase 2 (Web Locks).

### 2.5. Store (`src/chat/chats-store.ts`)

- **`Message` becomes a union:**
  - `OutMessage {id, direction:"out", text, time, status, idMessage?}` (the spec 003 shape, unchanged);
  - `InMessage {id, direction:"in", text: string | null, time, idMessage: string}`, with no status.
- **`Chat`** gets `unread: number` and `title?: string`.
- **`receive(incoming)`** (synchronous, a no-op when `idInstance === null`):
  - creates the chat if it's missing;
  - **dedupes by `idMessage` within the chat**;
  - inserts after the last message with `time <= new.time` (ties keep arrival order);
  - `unread += 1` if the chat isn't `selectedId`;
  - for `@lid` chats, sets or refreshes `title` from a non-empty `name`.
- **`select` / `addChat`** set `unread: 0`.
- **Sorting:** already derived from the last message's time, so a late 09:00 reply doesn't move the chat or change its preview (functional §2.2 c6). No change.
- **`merge` validation stays at `version: 1`** (a version bump without `migrate` would wipe the saved spec 003 chats):
  - `isMessage` accepts `out` messages, or `in` messages with a string `idMessage` and text that's a string or `null`;
  - `isChat` accepts a missing or non-negative `unread`, and a missing or string `title`;
  - a missing `unread` is restored as `0`;
  - `sending → unknown` applies to `out` messages only.

### 2.6. UI

| Path | Change |
|---|---|
| `src/chat/Conversation.tsx` + css | `.in { align-self: flex-start; background: var(--color-bubble-in) }`; incoming bubbles show `HH:MM`, with no mark or retry; the placeholder is muted italic «Сообщение этого типа пока не поддерживается» (one shared constant); the header uses `chatTitle(chat)`; the existing scroll effect (`[chatId, messages.length]`) already covers incoming messages |
| `src/chat/ChatList.tsx` + css | `chatTitle(chat)`; the preview shows the text or the placeholder string; a green badge `<span aria-label="N непрочитанных">N</span>` when `unread > 0` |
| `src/chat/phone.ts` | `chatTitle(chat)`: `@lid` → `title ?? "Неизвестный номер"`, otherwise `formatTitle(id)` |
| `src/chat/MainScreen.tsx` | starts the receive loop effect |
| `src/index.css` | `--color-bubble-in #ffffff / #202c33`, `--color-badge #25d366 / #00a884`, `--color-badge-text #ffffff / #111b21` |

---

## 3. Impact and Risk Analysis

- **System Dependencies:**
  - GREEN-API `receiveNotification` and `deleteNotification` (new).
  - The spec 003 chats store (`Message`, `Chat`, `merge`) and its UI.
  - The session counter, which marks the end of a session.
  - The Phase 2 "lost authorization" banner will reuse the loop's error classification.
- **Potential Risks & Mitigations** (riskiest first; slice 1 takes #1–#2):
  1. **The real notification shapes** (the empty-queue bytes, a real `incomingMessageReceived` body, reaction vs reply in practice) are only known from the docs. *Mitigation:* slice 1 = the client, `toIncoming`, the loop and their tests, plus a `[User]` `curl` read of the real queue **as soon as a working instance exists (TKT-5)**. Until then, doc-based fixtures.
  2. **The empty-queue body:** if it's `""` and isn't handled, the loop would quietly back off forever. *Mitigation:* `allowEmpty`, plus unit tests for `""` and `null`.
  3. **Existing tests break once polling starts** (unhandled requests under `onUnhandledFrame:"error"`; `requests` equality assertions). *Mitigation:* a default MSW handler, "empty queue that waits until aborted", passed to `setupServer`. Receives and deletes are recorded in their own `received` / `deleted` arrays, not in `requests`. All of this lands in the same commit as the loop.
  4. **Loop leaks** (StrictMode, logout races, test module reloads). *Mitigation:* an effect-owned `AbortController`, the session guard before save and before delete, store no-ops after `wipe`; tests for logout mid-poll and abort mid-backoff.
  5. **A notification that can't be parsed blocking the queue.** *Mitigation:* `toIncoming` never throws, and every notification with a `receiptId` is deleted whatever its body. Without a `receiptId` it can't be deleted; that case is surfaced in Phase 2 (review 3 F4).
  6. **Lid mode on a reviewer's instance** splits chats. *Mitigation:* the README says to keep "Use chat IDs" off; `@lid` chats still work as their own chats.
  7. **Multi-tab duplicates:** accepted until Phase 2 (functional §2.4 promises one tab).
  8. **Local-clock vs server-time skew** can place a reply above the message it answers: accepted.

---

## 4. Testing Strategy

- **MSW (`src/test/green-api-server.ts`):**
  - a default waiting handler for `receiveNotification`;
  - `queue(...answers)`, where each answer is a fixture, `null`, `status(429)` or `HttpResponse.error()`;
  - a DELETE handler that records the `receiptId`, answers `{result:true}` and pops the head, which is a real FIFO, so a failed delete re-delivers the notification.
- **Fixtures** (`src/chat/notification.fixtures.ts`, built from the doc examples):
  - text, extended, quoted, sticker;
  - `@lid` with and without a name;
  - group `@g.us`;
  - `outgoingMessageReceived`, `outgoingAPIMessageReceived`, `outgoingMessageStatus`;
  - `reactionMessage`.
- **Unit tests:**
  - `notification.test.ts`: a table over the fixtures.
  - `chats-store.test.ts`:
    - dedupe, sorted insert and ties;
    - unread vs selected;
    - title refresh;
    - spec 003 data without `unread` still merges;
    - `version` stays 1.
  - The client: URLs, `""`/`null` → `null`, a 401 empty body, no token in errors.
- **Loop tests** (`receive-loop.test.ts`):
  - the message is saved before the delete (assert localStorage inside the DELETE handler);
  - skipped notifications are still deleted;
  - a redelivery after a failed delete shows once;
  - abort stops everything;
  - backoff 1 / 2 / 4 / 5 / 5 s and its reset (fake `setTimeout` only);
  - a delete that keeps failing (500 other than "not found") backs off and never loops hot (review 3 F3);
  - an `online` event during a stalled receive cancels it and polls immediately (review 3 F2).
- **RTL + MSW** (`src/chat/receiving.test.tsx`): one test per functional criterion from §2.1 to §2.4, including the logout case.
- **No Playwright tests** (user decision 2026-10-06).
- **`[User]`, needs TKT-5:**
  - §2.5, a real reply from a phone;
  - the timing on a real instance (10 s over 5 replies, ≤ 30 s for a 20-reply backlog);
  - a `curl` read of the real queue (the empty bytes and a real body).

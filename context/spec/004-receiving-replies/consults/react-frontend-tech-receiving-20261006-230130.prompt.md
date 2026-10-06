You are running as the **`react-frontend`** agent (`claude --agent react-frontend`): your instructions are `.claude/agents/react-frontend.md`; the skills it lists are in `.claude/skills/`. Read `CLAUDE.md` first.
This is a **consultation**, not a lane: answer the questions below in markdown. Read, search and run read-only commands as you need (verify versions and option names — do not guess). Create or edit **no files**, with one exception: when your answer is complete, write it in full to `context/spec/004-receiving-replies/consults/react-frontend-tech-receiving-20261006-230130.md` with the Write tool (that path is pre-approved), then end your turn with exactly this line:

    CONSULT react-frontend tech-receiving: DONE

The lead quotes the file verbatim — no preamble, no restating the questions; cite the files and commands you used to verify facts.

---

You are consulted as the `react-frontend` specialist for spec 004 (Receiving Replies). The lead writes `technical-considerations.md` from your answer. Write nothing except your answer file.

**User's standing rule: avoid overengineering** (minimal _inside_ each feature). Test suite = Vitest + RTL + MSW only, **no Playwright tests** in the repo.

## Read first

- `context/spec/004-receiving-replies/functional-spec.md` (18 criteria; the Russian texts are exact)
- `context/spec/004-receiving-replies/reviews/TRIAGE.md`
- `context/product/architecture.md` (§2 data model: dedupe by `idMessage`, save before delete, ordering, ms vs s timestamps; §4 receiving: `receiveNotification`/`deleteNotification`, notification handling as amended by spec 004, the backoff rules, and the token echoed in 400 bodies)
- The existing code: `src/api/green-api.ts`, `src/chat/outcomes.ts`, `src/chat/chats-store.ts` (per-instance persist key, session counter, `open`/`wipe`, `merge`), `src/chat/*` components, `src/auth/session-store.ts`, `src/test/green-api-server.ts`

## Answer concretely (paths, contracts, no full code)

1. **GREEN-API contracts** (official docs, green-api.com):
   - `ReceiveNotification`: URL, `receiveTimeout`, an empty-queue answer, and the response `{receiptId, body}`.
   - `DeleteNotification`: URL and response.
   - The `incomingMessageReceived` webhook body: `senderData` (`chatId`, `sender`, `senderName`, `senderContactName`, `chatName`, and any `senderPhoneNumber`-like field); `messageData.typeMessage` values; where text lives for `textMessage` vs `extendedTextMessage`; `idMessage`; `timestamp` (units).
   - **The key question: when does `senderData.chatId` come as `…@lid` instead of `…@c.us`, and is the phone number then available in another field?** Quote the docs.
   - Also: the outgoing notification types we must skip, and whether `sendMessage` accepts an `@lid` chatId.
   - Rate limits for both methods.
   - **Probe with fake credentials only** (`curl`, `Origin: https://dustyo-o.github.io`, host `7103.api.greenapi.com`): GET `receiveNotification` (with `receiveTimeout`) and DELETE `deleteNotification/1`. Status, body, CORS, rate-limit headers.
2. **The receive loop:**
   - where it lives;
   - start/stop (sign-in/resume vs logout/wipe, using the session counter);
   - one notification at a time: receive → handle → save → delete;
   - the long-poll timeout and the per-request budget;
   - backoff on network errors / 429 / 5xx (values), resuming by itself;
   - what happens on 401/403 (stop? Phase 2 handles the banner), and on a failed delete;
   - how to avoid two loops (StrictMode, re-sign-in).
3. **Mapping a notification to a chat and message:**
   - the chat key rule (`@c.us` number vs `@lid`), and how a reply from a known number matches an existing chat created by the user;
   - title data for `@lid` chats (the WhatsApp name, else «Неизвестный номер»);
   - text vs placeholder;
   - skipping groups/outgoing/status/etc.;
   - the dedupe key, the timestamp conversion, and the ordering;
   - the unread count;
   - what's persisted.
4. **Store changes** (`chats-store.ts`):
   - `Message.direction` adds `"in"`;
   - `Chat` adds `unread` and an optional `title`;
   - a `receive(…)` action;
   - the `merge` validation for the new fields, with compatibility for already-saved spec 003 data;
   - sorting by the latest message time (already derived?).
5. **UI changes:** incoming bubble styling and the placeholder bubble; the unread badge in the list and clearing it on open; scroll on a new incoming message (the existing effect?); titles for `@lid` chats; the new tokens.
6. **Tests** (Vitest + RTL + MSW only): MSW handlers for a notification queue (a sequence of receive answers, delete recording), fake timers for backoff, and one test per criterion where possible. Which criteria stay `[User]` (real replies, TKT-5)?
7. **Risks**, riskiest first, with mitigations; the lead puts the riskiest unknown into slice 1.

Format: one `##` per question, terse bullets. End with `## Open questions for the lead` (empty if none).

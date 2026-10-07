You are running as the **`react-frontend`** agent (`claude --agent react-frontend`): your instructions are `.claude/agents/react-frontend.md`; the skills it lists are in `.claude/skills/`. Read `CLAUDE.md` first.
This is a **consultation**, not a lane: answer the questions below in markdown. Read, search and run read-only commands as you need (verify versions and option names — do not guess). Create or edit **no files**, with one exception: when your answer is complete, write it in full to `context/spec/005-connection-auth-states/consults/react-frontend-tech-banners-20261007-145747.md` with the Write tool (that path is pre-approved), then end your turn with exactly this line:

    CONSULT react-frontend tech-banners: DONE

The lead quotes the file verbatim — no preamble, no restating the questions; cite the files and commands you used to verify facts.

---

You are consulted as the `react-frontend` specialist for spec 005 (Connection & Authorization States). The lead writes `technical-considerations.md` from your answer. Write nothing except your answer file.

**User's standing rule: avoid overengineering** (minimal _inside_ each feature). Tests: Vitest + RTL + MSW only, **no Playwright tests** in the repo.

## Read first

- `context/spec/005-connection-auth-states/functional-spec.md` (19 criteria; the Russian texts are exact) and `reviews/TRIAGE.md`
- `context/product/architecture.md` (§4 GREEN-API, error handling, the token echoed in error bodies)
- The existing code: `src/chat/receive-loop.ts` (backoff, the `online` listener, budgets, error classification), `src/chat/notification.ts`, `src/chat/outcomes.ts` (`checkNumber`, `sendText`), `src/chat/chats-store.ts` (`send`, `retry`), `src/auth/check-instance.ts` + `messages.ts` (the per-state texts), `src/auth/session-store.ts`, `src/chat/MainScreen.tsx`, `Conversation.tsx`, `Composer.tsx`, `NewChatForm.tsx`, `src/test/green-api-server.ts`
- Spec 004 `tasks.md` slice 1 ledger: the user's real queue read was `{"receiptId":1,"body":{"typeWebhook":"stateInstanceChanged","instanceData":{…},"timestamp":…,"stateInstance":"authorized"}}`

## Answer concretely (paths, contracts, no full code)

1. **Logout detection (the riskiest question):** from the docs (green-api.com: the `stateInstanceChanged` notification page, GetSettings/SetSettings `stateWebhook` or similar, and the type-webhook list), is `stateInstanceChanged` always queued for HTTP-API receiving, or only when a setting is on? Which `stateInstance` values does it carry? Then: do we need the 5-minute `getStateInstance` fallback (rate limit 1 rps), or is the notification enough? Recommend the minimal design that meets functional §2.3 "within 5 minutes".
2. **The response-to-state mapping** (review F3) for receive, delete, `sendMessage`, `checkWhatsapp` and `getStateInstance`:
   - 401 (wrong token on the right host: verified with CORS, spec 002 probe) → access key;
   - 403;
   - the fetch `TypeError` (ambiguous → no connection);
   - the budget timeout;
   - 429;
   - 5xx;
   - `badBody`.
     Which ones count as "no connection", "key invalid" or "receiving stuck" (non-network, non-401, for 1 minute, incl. persistent delete failures)? The "two network failures in a row" rule, the device `offline`/`online` events, and the 20 s bound with the 8 s receive budget.
3. **State model:** where the banner state lives (a small store or slice?), its shape (the four conditions plus the instance state value), the priority selector, who sets and clears each one (the receive loop, the send/check outcomes, `online`/`offline`, the state notification, the fallback check), and resetting on logout.
4. **Sending paused:** the guard at every entry point (Composer Enter, `retry`, `NewChatForm` submit), the placeholder texts, in-flight sends finishing normally. Where the guard lives (store actions vs components)?
5. **UI:** a `Banner` component in the right-hand area (above the conversation or placeholder): red/grey/neutral variants, the «Выйти» button for the key banner (reuse `signOut`), and tokens.
6. **Tests** (Vitest + RTL + MSW): one per criterion, using fake timers for the 3 s / 20 s / 1 min / 5 min bounds, the device `offline`/`online` events, MSW answers for 401/403/5xx/`TypeError` and the state notifications. Which criteria stay `[User]` (a real logout needs TKT-5; a real token rotation does not)?
7. **Risks**, riskiest first, with mitigations; the lead puts the riskiest unknown into slice 1.

Format: one `##` per question, terse bullets. End with `## Open questions for the lead` (empty if none).

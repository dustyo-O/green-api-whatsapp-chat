You are running as the **`react-frontend`** agent (`claude --agent react-frontend`): your instructions are `.claude/agents/react-frontend.md`; the skills it lists are in `.claude/skills/`. Read `CLAUDE.md` first.
This is a **consultation**, not a lane: answer the questions below in markdown. Read, search and run read-only commands as you need (verify versions and option names — do not guess). Create or edit **no files**, with one exception: when your answer is complete, write it in full to `context/spec/003-chats-sending/consults/react-frontend-tech-chats-20261006-172726.md` with the Write tool (that path is pre-approved), then end your turn with exactly this line:

    CONSULT react-frontend tech-chats: DONE

The lead quotes the file verbatim — no preamble, no restating the questions; cite the files and commands you used to verify facts.

---

You are consulted as the `react-frontend` specialist for spec 003 (Chats & Sending). The lead writes `technical-considerations.md` from your answer. Write nothing except your answer file.

**User's standing rule: avoid overengineering.** It's a 5-day hiring test task. Propose the smallest design that meets the spec, and say what to leave out.

## Read first

- `context/spec/003-chats-sending/functional-spec.md` (the contract, 21 criteria; the Russian texts are exact)
- `context/spec/003-chats-sending/reviews/TRIAGE.md`
- `context/product/architecture.md` (§1 phone handling, §2 data model incl. drafts and dedupe, §4 GREEN-API: `checkWhatsapp`, `sendMessage`, the ❔ unknown outcome)
- The existing code from specs 001–002: `src/api/green-api.ts`, `src/auth/*` (session store, `checkInstance` with the 15 s budget and retry-once-on-429), `src/chat/MainScreen.tsx`, the tests, and `src/test/green-api-server.ts` (MSW)

## Answer concretely (paths, contracts, no full code)

1. **GREEN-API contracts.** Check against the official docs (green-api.com): the exact URL, method, request body and response for `checkWhatsapp` and `sendMessage`, and the documented error statuses. Then **probe with fake credentials only** (`curl` with `Origin: https://dustyo-o.github.io`, e.g. `https://7103.api.greenapi.com/waInstance7103000000/checkWhatsapp/badtoken` with a JSON body) to confirm the status, the body and the CORS behaviour of a POST with `Content-Type: application/json`, including the preflight. Note any rate limit headers.
2. **Outcome mapping:**
   - `checkWhatsapp` → `exists | notOnWhatsapp | checkFailed`;
   - `sendMessage` → `sent (idMessage) | failed | unknown`.

   Map every case: 2xx shapes, 4xx (which ones are a definite refusal), 429 (reuse the retry-once?), 5xx, `TypeError`, timeout. Give the send timeout value. Reuse the existing client patterns (status before parse, no token in errors).

3. **Chats store:** a separate Zustand + persist store or an extension of the session store? Give the shape:
   - chats keyed by chat id `<code><digits>@c.us`;
   - messages with a local id, text, time, direction, status and `idMessage`;
   - drafts per chat; the selected chat.

   Also cover:
   - the persist key per `idInstance` (architecture §2);
   - logout clearing it;
   - the reload migration "🕓 → ❔" (where and how);
   - the size of what we persist.

4. **Phone module:** the country list constant, normalisation (strip spaces, brackets and dashes), joining the code and the digits, the `+7` display format `+7 900 123-45-67`, and the "Другая страна" code field.
5. **Components and files:** the sidebar (header «+», new-chat row, chat list), the conversation (header, bubbles, marks, «Повторить», the confirm for ❔), the composer (auto-growing textarea, max 6 lines, Enter / Shift+Enter, the draft binding). Say which existing files change. For «Сообщение могло уже уйти. Отправить ещё раз?», is `window.confirm` the minimal choice, or an inline confirm? Recommend one.
6. **Styling:** the bubble colours and the list item layout with CSS Modules and the existing tokens; what to leave out.
7. **Tests:** unit (phone, mapping, store migration), integration (RTL + MSW per criterion), and which criteria stay `[User]` (real delivery, and a real `checkWhatsapp` true/false). Any new dependencies? (Prefer none.)
8. **Risks**, riskiest first, with mitigations; the lead puts the riskiest unknown into slice 1.

Format: one `##` per question, terse bullets. End with `## Open questions for the lead` (empty if none).

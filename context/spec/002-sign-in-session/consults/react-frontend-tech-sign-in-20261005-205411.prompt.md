You are running as the **`react-frontend`** agent (`claude --agent react-frontend`): your instructions are `.claude/agents/react-frontend.md`; the skills it lists are in `.claude/skills/`. Read `CLAUDE.md` first.
This is a **consultation**, not a lane: answer the questions below in markdown. Read, search and run read-only commands as you need (verify versions and option names — do not guess). Create or edit **no files**, with one exception: when your answer is complete, write it in full to `context/spec/002-sign-in-session/consults/react-frontend-tech-sign-in-20261005-205411.md` with the Write tool (that path is pre-approved), then end your turn with exactly this line:

    CONSULT react-frontend tech-sign-in: DONE

The lead quotes the file verbatim — no preamble, no restating the questions; cite the files and commands you used to verify facts.

---

You are consulted as the `react-frontend` specialist for spec 002 (Sign-In & Session). The lead writes `technical-considerations.md` from your answer and quotes it to the user. Write nothing except your answer file.

**User's standing rule: avoid overengineering.** This is a 5-day hiring test task; the brief asks for "maximally simple, minimal set of functions". Propose the smallest design that meets the spec. If something is optional, say so and recommend leaving it out.

## Read first

- `context/spec/002-sign-in-session/functional-spec.md` (the contract: §2.1–§2.5, incl. the Russian message table)
- `context/spec/002-sign-in-session/reviews/TRIAGE.md`
- `context/product/architecture.md` (stack: React 19, TS strict, Vite, Zustand + persist, CSS Modules, typed fetch client, Vitest + RTL + MSW; §4 GREEN-API methods; the wrong-apiUrl → `TypeError` finding)
- The existing code from spec 001: `src/`, `vite.config.ts`, `package.json`, `e2e/` (tests run in Vitest; `npm run check` is the gate)

## Answer concretely (paths, contracts, no full code)

1. **File layout:** every new or changed file, with one line of responsibility each. Keep the spec 001 version label somewhere sensible (e.g. the login footer) and don't break spec 001's tests.
2. **GREEN-API client:** the functions for `getStateInstance` and `getSettings`, the URL shape, a 15 s timeout (how), and **one mapping from every outcome to the spec §2.2 message keys**. Cover HTTP 401/403, fetch `TypeError`, timeout, non-JSON or unexpected bodies, each `stateInstance` value, and the `webhookUrl`/`incomingWebhook` checks. Say which order the two calls run in, and whether `getSettings` is skipped when not authorized.
3. **Session state:** the Zustand store shape and its `persist` config (key name, what's saved: only the credentials + the custom-URL flag?), how unreadable saved data → empty form (§2.4), and logout clearing it.
4. **Screens:** the minimal state for `checking | signedOut | signedIn`, and how reload triggers the check.
5. **Form:** API URL derivation (empty until 4 digits), trimming, validation (a parseable https URL, trailing `/` ignored), the show/hide token toggle, and the busy state (no double submit).
6. **UI and styling:** a minimal WhatsApp Web-like layout for the main screen (§2.3) with CSS Modules: palette tokens, two columns. No component library.
7. **Tests:** what to unit-test (client mapping, derivation/validation), integration with RTL + MSW (which handlers), and which spec criteria stay manual or `[User]` (the real-instance check). Is MSW a new devDependency? Check versions with `npm view` (msw, @testing-library/user-event, @testing-library/jest-dom if you want it). Note any peer conflicts.
8. **Real-world probe (no real credentials!):** with `curl` and an `Origin: https://dustyo-o.github.io` header, confirm what GREEN-API returns for a **matching** host and id with a wrong token (e.g. `https://7103.api.greenapi.com/waInstance7103000000/getStateInstance/badtoken` and `/getSettings/badtoken`): the status, the body, and whether CORS headers are present. That decides whether "wrong credentials" is distinguishable in the browser.
9. **Risks**, riskiest first, with mitigations. The lead puts the riskiest unknown into slice 1.

Format: one `##` per question, terse bullets. End with `## Open questions for the lead` (empty if none).

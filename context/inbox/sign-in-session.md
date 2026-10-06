# Sign-In & Session — grill notes 2026-10-05

Ticket: **TKT-2** (context/inbox/TICKETS.md) · Roadmap: Phase 1 → "Sign-In & Session" · User: all recommended answers, **"please avoid overengineering"**.

## Decisions

- D1: The UI is in **Russian**. No language switcher.
- D2: After sign-in the user lands on the **empty WhatsApp Web-style layout**: a sidebar header with the instance number and a logout button, and a "select a chat" placeholder in the main area. No chat list, composer or messages (that's "Chats & Sending").
- D3: Login form: `idInstance`, `apiTokenInstance`, and the **API URL** field last. The API URL is filled in from the first 4 digits of `idInstance` and locked; a "Custom API URL" checkbox unlocks it (architecture §4). All fields are trimmed.
- D4: Sign-in succeeds only if the instance is **authorized** and **ready to receive** (incoming notifications on, no webhook URL). Otherwise the user stays on the form with a message naming what's wrong and what to change in the GREEN-API console, plus a "Check again" button. The app never changes instance settings itself.
- D5: Instance states other than authorized (not authorized, blocked, sleep mode, starting, suspended) each get one short message. No automatic retries.
- D6: The token field is masked, with a show/hide toggle.
- D7: Simple validation before submit: `idInstance` digits only, the token not empty, the API URL starting with `https://`. Submit stays disabled until all three are valid; a short hint appears under an invalid field.
- D8: Wrong credentials (the server rejects them) get one message. Can't reach GREEN-API (wrong API URL **or** offline; the browser can't tell them apart) gets one combined message: "Couldn't reach {API URL}. Check the API URL in the GREEN-API console and your internet connection."
- D9: The credentials are remembered in the browser. On reload a short "Checking instance…" screen appears; success goes straight in. Any failure shows the login form **prefilled**, with the reason (and "Try again" when GREEN-API couldn't be reached).
- D10: Logout is one click, with no confirmation. It clears the saved credentials and returns to an empty login form.
- D11: Development and automated tests use a **mocked GREEN-API only**. Real credentials never go into the repo, tests or logs. One **real-instance check** at the end is a `[User]` step: a free GREEN-API developer account with a WhatsApp instance linked by QR code.

## Out of scope

- The chat list, starting chats, sending and receiving (later Phase 1 specs).
- The "connection lost" banner while signed in, and single-active-tab behaviour (Phase 2).
- Changing instance settings from the app; multiple instances; English UI.
- Automatic retries, a logout confirmation, password managers or any server-side storage.

## Open risks

- The **API URL derivation pattern** (`https://<first 4 digits>.api.greenapi.com`) is only confirmed for `7103…`; the user's real instance confirms or breaks it (the checkbox override is the fallback).
- The **exact error responses** for a valid instance id with a wrong token (`401` vs `403`, with CORS headers or not) were seen only with fake ids. If a wrong token also surfaces as a fetch-level error, D8's two messages merge into one.
- The settings check depends on the exact `getSettings` field values (`incomingWebhook: "yes"`, empty `webhookUrl`), so the mock must match the real response shape.

## Suggested acceptance criteria

- With a real authorized, ready instance, entering `idInstance` and the token (API URL auto-filled) lands on the empty chat layout showing the instance number.
- Reloading the page keeps the user signed in after a brief "Checking instance…" screen.
- Logout returns to an empty login form, and a reload stays logged out.
- A wrong token, an unauthorized instance, a not-ready instance and an unreachable API URL each show their own message, and the form keeps what the user typed.

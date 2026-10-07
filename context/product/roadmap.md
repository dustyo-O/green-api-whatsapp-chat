# Product Roadmap: GREEN-API WhatsApp Chat

_This roadmap outlines our strategic direction based on customer needs and business goals. It focuses on the "what" and "why," not the technical "how."_

_Hard deadline: submission by **2026-10-10** (5 days from 2026-10-05). Phases are ordered so that a submittable product exists after Phase 1 + Phase 3; Phase 2 makes it robust, Phase 4 happens only if time remains._

---

### Phase 1

_The highest priority features that form the core foundation of the product: the brief's end-to-end flow (credentials → new chat → send → recipient replies → reply visible). Target: 2026-10-05 – 2026-10-07._

- [x] **Project Skeleton & First Deploy**
  - [x] **Live "Hello" Page on GitHub Pages:** An empty app, built and deployed by CI on day 1, so the public-link path is proven before any features depend on it.

- [x] **Sign-In & Session**
  - [x] **Credentials Login with Readiness Check:** Let the user enter `idInstance` and `apiTokenInstance` (the API URL is filled in from `idInstance`, with a checkbox to override it) and only let them in once the instance exists, is authorized in WhatsApp, and is ready to receive replies (incoming notifications on, no webhook set). Otherwise, say which check failed and what to change in the GREEN-API console, so a reviewer never ends up in a chat that can't receive.
  - [x] **Remembered Session & Logout:** Keep the user signed in across reloads (re-checking the saved credentials each time) and let them log out, which clears credentials and chats from the browser.

- [x] **Chats & Sending**
  - [x] **WhatsApp Web-Style Chat Layout:** A sidebar chat list, a conversation pane with a header, incoming and outgoing bubbles with timestamps, a composer, and empty states, so the app feels familiar straight away.
  - [x] **New Chat by Phone Number:** Start a conversation by entering the recipient's international number. Different spellings of the same number open the same chat, and invalid numbers are rejected with a clear message.
  - [x] **Send Text Messages with Status:** Send text from the composer (Enter sends). Each message shows sending → sent, or failed with its text kept and a manual retry, so the user always knows whether a message went out and never sends one twice by accident.
  - [x] **Chats Saved Across Reloads:** The chat list and its messages survive a page reload, so a reviewer doesn't lose the conversation while testing.

- [x] **Receiving Replies**
  - [x] **Incoming Text Messages in the Right Chat:** Replies from the recipient appear in their chat within 10 seconds, without a reload. This is the brief's final success step.
  - [x] **New Chat for Unknown Senders:** A text from a number with no chat yet creates one at the top of the list, so no reply is ever dropped.
  - [x] **Reliable Queue Handling:** Non-text and group events are skipped without blocking later messages. Every reply appears exactly once and in the order it was sent.

---

### Phase 2

_Once the core flow works end to end, make it hold up when things go wrong during a reviewer's session. Target: 2026-10-08._

- [ ] **Connection & Authorization States**
  - [ ] **Connection-Lost Banner with Auto-Recovery:** If the network drops, show a banner, keep chats and the unsent draft, pause sending, and resume receiving on its own once the connection is back.
  - [ ] **Instance-Lost-Authorization Handling:** If the WhatsApp instance stops being authorized after login, say so and point the user to the GREEN-API console to re-authorize.

- [ ] **One Active Tab**
  - [ ] **Single Active Tab per Instance:** Only one tab receives and sends messages. Any other tab shows an "already open in another tab" screen with an option to use it here instead, so two tabs never split the incoming messages between them.
  - [ ] **Logout Everywhere:** Logging out in one tab logs out every open tab.

---

### Phase 3

_Turn the working app into a complete submission that meets the brief's checklist. Target: 2026-10-09; send by 2026-10-10._

- [ ] **Documentation**
  - [ ] **README for Reviewers:** Run locally in ≤ 3 commands, instance prerequisites (authorized WhatsApp instance, incoming notifications on, empty webhook URL), and the two deliberate deviations (WhatsApp instead of MAX, because there's no MAX account; WhatsApp Web as the visual prototype).

- [ ] **Public Delivery**
  - [ ] **Live Demo on GitHub Pages:** A public link a reviewer can open and test with their own instance credentials, with no setup.
  - [ ] **Screenshots & Demo Video:** Screenshots of the key screens and a short recording of the full send → reply → see-reply flow.

- [ ] **Submission**
  - [ ] **Submission Email:** Send to hr@green-api.com with the exact subject from the brief: resume PDF with Telegram handle, repo link, README link, preferred work format, live demo link, demo assets link, and one sentence on why it's WhatsApp.

---

### Phase 4

_Stretch: only once Phases 1–3 are done and the submission is ready to send. Its priority and scope may be refined based on the time left._

- [ ] **Chat History**
  - [ ] **Load Recent History on Opening a Chat:** Show the last text messages from the server when a chat opens, merged with locally saved messages without duplicates, so earlier conversation context is visible.

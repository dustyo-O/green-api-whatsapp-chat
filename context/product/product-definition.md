# Product Definition: GREEN-API WhatsApp Chat

- **Version:** 1.2
- **Status:** Proposed
- **Source:** [test-task-brief.md](test-task-brief.md) — test task for "Frontend Developer (React)" at GREEN-API, due **2026-10-10**
- **Messenger decision:** **WhatsApp**, using the fallback the brief allows ("if you cannot do the task for MAX, you may do it for WhatsApp or Telegram"). **Reason:** the author has no MAX account, so a MAX instance cannot be authorized and the "recipient replies in MAX" step cannot be demonstrated. The author does have, and knows, WhatsApp. The README and the submission email both state this.
- **Visual prototype decision:** **WhatsApp Web** (web.whatsapp.com) instead of web.max.ru. Requirement 4 names web.max.ru because the brief was written for MAX; with WhatsApp as the messenger, the matching messenger's web client is the consistent prototype. The README states this deviation in one sentence.

---

## 1. The Big Picture (The "Why")

### 1.1. Project Vision & Purpose

A minimal web chat, styled after WhatsApp Web, that lets a GREEN-API customer send and receive text messages in **WhatsApp** straight from the browser, using only their GREEN-API instance credentials. The purpose is to show, within five days, that the author can build a clean, working React interface on top of a real third-party messaging API.

### 1.2. Target Audience

- **Primary:** GREEN-API reviewers (hiring team) who will open the deployed site or run it locally, enter their own instance credentials, and check the end-to-end send → reply → see-reply flow.
- **Nominal end user:** a GREEN-API customer with an authorized WhatsApp instance who wants a quick browser chat with phone-number contacts, without writing code.

### 1.3. User Personas

- **Persona 1: "Irina the Reviewer"**
  - **Role:** Frontend lead at GREEN-API reviewing test-task submissions.
  - **Goal:** Within ~10 minutes: open the app, paste `idInstance` / `apiTokenInstance`, message her own phone, reply from WhatsApp, and see the reply show up, then skim the code.
  - **Frustration:** Submissions that don't start, need undocumented setup, hide errors, or add features nobody asked for while the core flow breaks.

- **Persona 2: "Oleg the Small-Business Owner"** _(assumption)_
  - **Role:** Runs a small shop and uses GREEN-API to talk to customers on WhatsApp.
  - **Goal:** Reply to a customer from a laptop browser in a familiar, WhatsApp-like interface.
  - **Frustration:** The raw API and console are not a chat; he doesn't want to make HTTP requests by hand.

### 1.4. Success Metrics

- **End-to-end flow:** on a real instance that meets the prerequisites in §2.1, the full journey passes with no page reload: credentials → new chat by phone → send text → recipient replies in WhatsApp → reply visible in the UI.
- **Latency:** with the app open on a normal broadband connection, a reply sent from the recipient's phone appears in the chat **within 10 seconds**. Checked over 5 consecutive replies.
- **No lost or duplicated messages:** across that same check, every reply appears exactly once, in the order it was sent.
- **Local run:** a reviewer can run the app from the README in **≤ 3 commands** on a machine with Node installed.
- **Visual checklist vs WhatsApp Web:** left sidebar with chat list and "new chat" action; right pane with a chat header (phone number), message area, and a bottom composer; outgoing bubbles on the right and incoming on the left, in visibly different colours; each bubble shows its time; an empty state when no chat is selected.
- **Feature list is closed:** the app does exactly what §2.1 lists. The only extras beyond the brief are deliberate and named: reload persistence (§3.1) and, as a stretch goal, chat history (§3.1).
- **Every failure is visible:** wrong credentials, an instance that isn't authorized or ready, connection loss, an invalid phone number and a failed send each produce a specific message in the UI. None fails silently.
- **Submission** is sent by **2026-10-10** and meets the checklist in §3.3.

---

## 2. The Product Experience (The "What")

### 2.1. Core Features

- **Credentials login:** a form for `idInstance` and `apiTokenInstance`, plus a last **API URL** field. The API URL is filled in automatically from `idInstance` and locked by default. A "Custom API URL" checkbox lets the user paste the exact value from the GREEN-API console instead. Before entering the chat, the app checks that the instance exists, is authorized in WhatsApp, and is **ready to receive** (incoming-message notifications are on and no webhook URL is set, so replies go to the polling queue). If a check fails, the user sees which one failed and what to change in the GREEN-API console. The README lists these instance prerequisites.
- **New chat by phone number:** the user picks the country (a short list, Russia by default, or «Другая страна» with a typed code) and types the national number. Spaces, brackets and dashes are stripped, so equivalent spellings open the same chat instead of creating a duplicate; there's no length check. Before a new chat is created, the app checks the number uses WhatsApp and says so if it doesn't (spec 003, decided 2026-10-06). The chat appears in the sidebar list.
- **Send text messages** via GREEN-API `SendMessage`. A new message appears straight away as **sending**, then becomes **sent** once GREEN-API accepts it, or **failed** if it doesn't. A failed message keeps its text and offers a manual **retry**; nothing is retried automatically, so a message is never sent twice by accident. "Sent" means GREEN-API accepted the message, not that the recipient has read it.
- **Receive text messages** via the GREEN-API HTTP API: the app polls for notifications (`ReceiveNotification`) and removes each one from the queue (`DeleteNotification`) after handling it.
  - An incoming personal text message is saved in the matching chat, and only then removed from the queue.
  - A text from a number with no existing chat **creates a new chat** at the top of the list. Replies are never dropped.
  - Every other notification (media, groups, statuses, delivery receipts and so on) is **removed from the queue and skipped**, so it can't block the messages behind it.
  - A message that arrives twice is shown only once. Messages in a chat are ordered by when they were sent.
- **Connection and authorization states:** if the network drops or the instance stops being authorized after login, a banner says so. Chats and the unsent draft stay in place, sending is paused, and receiving resumes on its own once things recover. If the instance is no longer authorized, the banner tells the user to re-authorize it in the GREEN-API console.
- **Single active tab:** only one browser tab per instance receives and sends messages. Any other tab shows an "already open in another tab" screen with an option to use it here instead. Logging out in any tab logs out every tab.
- **WhatsApp Web-style chat UI:** chat list, conversation pane with outgoing/incoming bubbles, timestamps and send status, a message composer (Enter sends), empty states, and a logout action.

### 2.2. User Journey

The user opens the site and sees a login screen. They paste the `idInstance` and `apiTokenInstance` from their GREEN-API console and submit. The app checks the instance (exists, authorized, ready to receive) and opens the main chat screen. If something is missing, it explains what to fix in the console instead. They click "new chat", enter a phone number, and the conversation opens. They type "Hello" and press Enter. The message appears as an outgoing bubble marked "sending", then "sent". On their phone, the recipient replies in WhatsApp. Within 10 seconds the reply appears in the conversation as an incoming bubble. A page reload re-checks the saved credentials and keeps them logged in with their chats intact. Logging out clears the credentials and chats from the browser and closes the session in every open tab.

---

## 3. Project Boundaries

### 3.1. What's In-Scope for this Version

- A React single-page app styled after WhatsApp Web (see the visual prototype decision above).
- A login screen for `idInstance` + `apiTokenInstance`, with checks that the instance exists, is authorized and is ready to receive, plus setup guidance.
- Credentials, chat list and messages saved in **localStorage** so they survive a reload; logout clears them in every tab. Nothing is stored on a server.
- Creating chats by recipient phone number with normalization. Several chats in a sidebar list. Incoming messages from unknown numbers create a chat.
- Sending text messages (`SendMessage`) with sending / sent / failed states and manual retry.
- Receiving incoming text messages by polling the HTTP API (`ReceiveNotification` / `DeleteNotification`), with non-text events skipped and duplicate messages shown only once.
- Connection-lost, not-authorized and other-tab states; loading, empty and error states.
- A README with the instance prerequisites, local-run instructions and the two documented deviations (messenger, prototype).

**Stretch goal (only once the core flow is done and submitted-quality):**

- Load recent text history when a chat is opened (`GetChatHistory`) and merge it with locally stored messages without duplicates.

### 3.2. What's Out-of-Scope (Non-Goals)

- Media, files, voice, stickers, locations, contacts, polls: **text only**. (Incoming non-text messages show a placeholder bubble «Сообщение этого типа пока не поддерживается» so a reply never silently disappears, spec 004.)
- Group chats, message editing/deleting, reactions, replies/quotes, read receipts / delivered ticks.
- Webhook-based receiving, or any backend or proxy service of our own.
- User accounts, multi-instance management, avatars from WhatsApp. (Exception, spec 004: a sender's WhatsApp name titles a chat only when WhatsApp hides the sender's number.)
- Mobile apps or full mobile-responsive polish beyond "usable".
- MAX and Telegram versions.

### 3.3. Submission Checklist

Mirrors the brief. Email to **hr@green-api.com**, subject **"Тестовое задание на должность - Фронтенд разработчик React"**.

**Required by the brief:**

1. Resume as a PDF attachment, with the author's Telegram handle for contact.
2. Link to the GitHub repository.
3. Link to the local-run instructions (the README).
4. Preferred work format: remote / Khimki office / Astana office.

**Optional in the brief, and our own commitments:**

5. Link to the deployed service (the brief calls it "desirable"). We commit to **GitHub Pages**.
6. Link to screenshots / a video demo (the brief says "if any"). We commit to screenshots plus a short screen recording of the end-to-end flow.

Also: one sentence in the email saying the task was done for WhatsApp because the author has no MAX account.

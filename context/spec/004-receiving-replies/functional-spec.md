# Functional Specification: Receiving Replies

- **Roadmap Item:** Phase 1 → Receiving Replies (incoming text messages in the right chat, new chat for unknown senders, reliable handling of everything else)
- **Status:** Draft
- **Author:** Alexander Shleyko
- **Ticket:** TKT-6 · **Source:** `context/inbox/receiving-replies.md` (grill decisions D1–D7)

---

## 1. Overview and Rationale (The "Why")

The brief ends with: "the recipient replies in the messenger; the user sees the recipient's reply in the chat". Until now the app can only send. This feature makes the conversation two-way. While the app is open, replies appear in the right chat within seconds, as WhatsApp-style bubbles on the left. A reply from a new contact opens a new chat, and replies that arrived while the app was closed show up after sign-in. Anything the app can't display yet (photos, voice, stickers) still shows that the contact replied, so a reply never silently disappears.

**Success looks like:** with the app open, the contact replies on their phone and the reply appears in the chat within 10 seconds. A reply is never lost or shown twice.

---

## 2. Functional Requirements (The "What")

### 2.1. Replies appear in the chat

- While the user is signed in and the app is open, a text message sent to the instance's WhatsApp appears in the chat with that sender **within 10 seconds** on a normal connection (checked over 5 consecutive replies, as in the product definition).
- It's a bubble on the **left**: white (dark grey in dark mode), with the text and the time it was sent (`HH:MM`), and no status mark.
- Messages in a chat are ordered by the time they were sent. If the chat is open, it scrolls to the new reply.
  - **Acceptance Criteria:**
    - [ ] Given the chat with `+7 903 747-44-11` is open, when that contact replies «Привет-привет» on their phone, then within 10 seconds a white bubble «Привет-привет» with its time appears on the left, below the earlier messages.
    - [ ] Given the user's own message «Привет» was sent at 10:00 and the contact's reply at 10:01, when the user looks at the chat, then «Привет» is above the reply.
    - [ ] Given the chat is open and scrolled to the newest message, when a reply arrives, then the newest message stays in view.

### 2.2. Replies in other chats and from new contacts

- When a reply arrives in a chat that isn't open, the chat gets a **green badge with the number of unread replies**; opening the chat clears it. The list order and each chat's preview always follow the chat's **latest message by time**: a fresh reply moves its chat to the top, but a reply that was sent long ago (e.g. delivered after the app was closed) doesn't jump above more recent activity.
- When a reply comes from a number that has no chat yet, a new chat with that number appears, with the badge. Like every chat, it's placed by its latest message's time, so a fresh reply puts it at the top.
- If WhatsApp doesn't reveal the sender's number, the chat is titled with the sender's WhatsApp name, or **«Неизвестный номер»** if there's no name. The reply is never dropped. Later replies from the same hidden sender land in that same chat; two different hidden senders get two separate chats even when both are titled «Неизвестный номер». The user can write back in such a chat like in any other.
  - **Acceptance Criteria:**
    - [ ] Given chat A is open and chat B is lower in the list, when B's contact sends two replies, then B moves to the top showing the last reply and a green badge «2», and when the user opens B, then the badge disappears.
    - [ ] When a number with no chat sends «Здравствуйте» now, then a new chat with that number appears at the top with «Здравствуйте» as its preview and the badge «1».
    - [ ] Given a reply arrives without the sender's number but with the sender's WhatsApp name «Иван», when the user looks at the list, then a chat titled «Иван» shows the reply.
    - [ ] Given a reply arrives without the sender's number and without a name, when the user looks at the list, then a chat titled «Неизвестный номер» shows the reply.
    - [ ] Given two different senders without a number or name, when each sends a reply, then two separate «Неизвестный номер» chats appear, and when the first sender replies again, then it lands in the first of them.
    - [ ] Given chat A's latest message is from 11:00 and chat B's from 10:00, when a reply to B that was sent at 09:00 is delivered late, then B gets the badge but stays below A and keeps its 10:00 preview.

### 2.3. Messages the app can't display

- A photo, voice message, sticker, file, location or other non-text reply shows as a grey bubble on the left, **«Сообщение этого типа пока не поддерживается»**, with its time.
- Messages in group chats don't appear at all.
- Messages typed on the instance account's own phone don't appear (only replies from contacts do).
  - **Acceptance Criteria:**
    - [ ] Given the chat with a contact is open, when the contact sends a sticker, then a grey bubble «Сообщение этого типа пока не поддерживается» with its time appears on the left.
    - [ ] When someone writes in a group the instance account is in, then no chat or bubble appears for it, and later replies from contacts still appear normally.
    - [ ] When the instance account's owner types a message on their own phone, then it doesn't appear in the app.

### 2.4. No reply is lost or shown twice

- With the app open in **one** browser tab, every reply appears **exactly once**, even across reloads and even if WhatsApp delivers the same reply to the app twice.
- Replies that arrived while the app was closed (WhatsApp keeps them for up to 24 hours) appear after the user signs in or reloads, in their chats, with their original times: within 30 seconds for up to 20 waiting replies.
- If the connection drops or GREEN-API asks the app to slow down, receiving keeps trying on its own (no message is shown yet; banners come in a later phase) and resumes by itself. Replies sent in the meantime appear within 10 seconds after the device's own connection comes back (the browser notices it and checks immediately). If the cut was further away (e.g. the router or the internet provider) and the device itself stayed connected, they appear within 20 seconds.
- Something the app can't display, or a group message, never stops later replies from appearing.
- After «Выйти», no more replies arrive in the app until the user signs in again.
  - **Acceptance Criteria:**
    - [ ] Given several replies have arrived, when the user reloads the page, then each reply is shown exactly once and in order.
    - [ ] Given the app was closed while the contact sent «Ты тут?», when the user opens the app and signs in, then «Ты тут?» appears in that chat with the time it was sent.
    - [ ] Given the same reply is delivered to the app twice, when the user looks at the chat, then it appears once.
    - [ ] Given the internet connection is off for 30 seconds while the contact sends «Я тут», when the connection is back, then «Я тут» appears within 10 seconds, without a reload.
    - [ ] Given a group message and a sticker arrived first, when the contact then sends «Текст», then «Текст» still appears within 10 seconds.

### 2.5. Real WhatsApp replies

- A reply typed on a real phone reaches the app.
  - **Acceptance Criteria:**
    - [ ] Given a signed-in real instance and a chat with the user's second WhatsApp number, when that phone replies «Привет-привет», then it appears in the chat within 10 seconds. _(Needs a linkable WhatsApp account, TKT-5.)_

---

## 3. Scope and Boundaries

### In-Scope

- Incoming text replies as left bubbles in the right chat within 10 seconds; ordering by time; scrolling an open chat to a new reply.
- Moving the chat to the top with a preview and an unread badge, cleared on opening; new chats for new numbers; a title from the WhatsApp name or «Неизвестный номер» when the number is hidden.
- A placeholder bubble for non-text replies; skipping group messages and messages typed on the instance's own phone.
- Each reply exactly once; replies received while the app was closed shown after sign-in; nothing ever blocking later replies; no replies after logout.

### Out-of-Scope

- Showing photos, voice, stickers or files themselves; reactions, edits or deletions made by the contact; read ticks ✓✓.
- Group chats; messages typed on the instance's own phone.
- Sound and browser notifications.
- The "connection lost" and "authorization lost" banners, and one active tab: Phase 2. Until then the "exactly once" promise holds for one open tab. That spec must also cover "the instance was logged out while the user is signed in", from the spec 003 finding.
- Chat history from GREEN-API: "Chat History" (stretch).

---

## Change Log

_Dated amendments made after the spec was first written — typically by `/awos:spec` in Update Mode when a bug fix changed documented behavior. Each entry records the date, the source reference (bug id or fix description), and what behavior changed and why. Leave empty until the first amendment._
- 2026-10-06 — review `spec-codex` stage 2 — §2.1: 10 s measured on a normal connection over 5 replies; §2.2: list order and preview follow the latest message by time, hidden senders keep their own chats and can be replied to; §2.4: one tab, duplicate deliveries shown once, backlog ≤ 30 s for ≤ 20 replies, receiving recovers by itself after a dropped connection or slow-down.
- 2026-10-06 — review `spec-codex` stage 3 — §2.2: new chats are placed by their latest message's time too; "at the top" applies to a fresh reply.
- 2026-10-07 — code review round 4 (PR #12), user decision (b) — §2.4: the 10 s recovery holds when the device's own connection comes back; an upstream cut the device doesn't notice recovers within 20 s (the loop's worst case after repeated failures is about 13–15 s).

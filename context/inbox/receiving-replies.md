# Receiving Replies — grill notes 2026-10-06

Ticket: **TKT-6** (context/inbox/TICKETS.md) · Roadmap: Phase 1 → "Receiving Replies" · Builds on spec 003 (chats store, conversation, chat list). User accepted every recommendation.

## Decisions

- D1 (Q1): Incoming messages are WhatsApp-style bubbles on the **left**, white (dark grey in dark mode), with the text and `HH:MM`, and no status mark.
- D2 (Q2): A reply in a chat that isn't open moves that chat to the top with the preview and shows a **green badge with the unread count**. Opening the chat clears it.
- D3 (Q3): Messages typed on the instance account's own phone are **ignored** (only incoming messages are shown).
- D4 (Q4): Incoming non-text messages (photo, voice, sticker, file, location, …) show a grey placeholder bubble **«Сообщение этого типа пока не поддерживается»** with its time, so the user sees that the contact replied. Group chats are skipped entirely.
- D5 (Q5): Replies are matched to a chat **by phone number** when one is present. If WhatsApp gives only a hidden id (`…@lid`), the reply goes into a chat keyed by that id, titled with the sender's **WhatsApp name** or **«Неизвестный номер»** if there's none. A reply is never dropped.
- D6 (Q6): Replies that arrived while the app was closed (GREEN-API keeps them for 24 h) come in after sign-in or a reload, into their chats, with their **original times**.
- D7 (Q7): **No sound or browser notifications.**
- From the product definition and architecture (not re-asked):
  - replies show within **10 s** while the app is open;
  - a reply from an unknown number opens a **new chat at the top**;
  - **no reply is shown twice**, and messages are ordered by their time;
  - skipped events never block later ones;
  - receiving stops on logout.

## Out of scope

- Displaying media, files, voice or stickers (beyond the placeholder); groups; reactions, edits and deletions from the other side; read ticks ✓✓.
- Messages typed on the instance phone; sound and browser notifications.
- One active tab, and the "connection lost" / "authorization lost" banners (Phase 2; that spec must also cover "instance logged out while signed in, sends still ✅", from the spec 003 slice 5 finding).
- Chat history from the server (stretch).

## Open risks

- **The `@lid` identity:** whether incoming notifications carry the sender's number or only a hidden id, and in which field. This decides matching to existing chats (D5). The consult reads GREEN-API's notification docs; the real check needs TKT-5.
- **Receive-queue mechanics:** the long-poll timeout, the rate limits on receiving and deleting, what happens when deleting fails (the same notification comes back, so duplicates must be suppressed), and the 24 h backlog arriving in a burst after sign-in.
- **Real checks need a working instance (TKT-5)** and a second phone to reply.

## Suggested acceptance criteria

- With a chat open, when the recipient replies «Привет-привет» on their phone, it appears within 10 s as a white bubble on the left with its time.
- When a reply arrives in a chat that isn't open, that chat moves to the top with the preview and a green badge «1», and opening the chat clears the badge.
- When a number with no chat writes, a new chat with that number appears at the top.
- When the contact sends a sticker, a grey «Сообщение этого типа пока не поддерживается» bubble appears.
- When the user reloads, every reply appears exactly once and in order, including ones received while the tab was closed.

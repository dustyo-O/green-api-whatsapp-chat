# Chats & Sending — grill notes 2026-10-06

Ticket: **TKT-4** (context/inbox/TICKETS.md) · Roadmap: Phase 1 → "Chats & Sending" · Builds on spec 002's empty two-column main screen. User rule: avoid overengineering.

## Decisions

- D1 (Q1): The **«+» button** in the sidebar header opens a phone-number field at the top of the chat list. Enter or **«Начать чат»** creates the chat and opens it.
- D2 (Q2, Q9): A **country picker** sits next to the number field. The default is 🇷🇺 Россия +7. The list: 🇷🇺 Россия +7, 🇰🇿 Казахстан +7, 🇧🇾 Беларусь +375, 🇺🇦 Украина +380, 🇺🇿 Узбекистан +998, 🇦🇲 Армения +374, 🇬🇪 Грузия +995, 🇷🇸 Сербия +381, 🇹🇷 Турция +90, 🇩🇪 Германия +49, 🇺🇸 США +1, and **«Другая страна»**, where the user types the country code. The user types the national number without the code (Russia: `9037474411`). There is no `8 → 7` conversion.
- D3 (Q10): **No length check.** Spaces, brackets and dashes are removed; the number must be digits only and not empty. The WhatsApp check (D4) catches wrong numbers.
- D4 (Q3, Q11, Q14): Before a chat is created, the app checks the number has **WhatsApp**. If not: «На этом номере нет WhatsApp». If the check itself fails (network, rate limit): «Не удалось проверить номер. Попробуйте ещё раз.» In both cases no chat is created and the field keeps the number. The check runs **only when a chat is created**, never when opening or sending into an existing chat. A number that already has a chat just opens it, with no check.
- D5 (Q4): Chat list entry: the number, the last message (one line, cut off) and its time, newest first. **+7 numbers are formatted** `+7 900 123-45-67`; all others are shown plain, e.g. `+381629443720`.
- D6 (Q5, Q12): Outgoing bubbles sit on the right in WhatsApp's light green, with the time `HH:MM` and an emoji mark: 🕓 sending · ✅ sent · ❗ failed, plus «Не отправлено · Повторить» under a failed message. «Повторить» resends that same message. Nothing is resent automatically.
- D7 (Q6, Q13): The composer is a textarea that **grows with the text up to 6 lines**, then scrolls inside. Enter sends; Shift+Enter adds a new line. An empty or whitespace-only message isn't sent. The field clears after sending.
- D8 (Q7): No deleting chats or messages. Logout clears all chats and messages (product definition).
- D9: Chats and messages survive a reload (product definition, architecture §2). A message that was still «sending» when the page closed is shown as failed (❗ + «Повторить») after the reload, so it is never resent by accident.
- D10 (Q8): The real check is a `[User]` step: from the instance account, start a chat with the user's **main WhatsApp on the other phone**, send «Привет», see ✅, and see it arrive on that phone. After a reload the chat and the message are still there.

## Out of scope

- Incoming messages, and new chats for unknown senders ("Receiving Replies"); chat history from the server (stretch).
- Contact names, avatars, read ticks ✓✓, deleting, editing, media, groups, a mobile layout.
- A full country list, per-country length checks, `8 → 7` conversion, formatting for non-+7 numbers.
- Re-checking WhatsApp on existing chats; automatic resends.

## Open risks

- **The WhatsApp check method:** the exact GREEN-API method name, request and answer for "does this number have WhatsApp", how it counts against rate limits, and how it behaves on the free developer plan. Only a real instance confirms it, so it goes first in slice 1.
- **SendMessage answers:** what `sent` actually means (GREEN-API accepted it vs delivered) and the error shapes for a bad chat id or quota. The free developer plan may limit how many chats or numbers can be messaged.
- **«Другая страна»:** the code field plus the number field must still give one clean international number (no doubled `+`, no leading zeros).

## Suggested acceptance criteria

- Signed in, the user clicks «+», keeps 🇷🇺 +7, types `900 123 45 67` and «Начать чат», and the chat opens titled `+7 900 123-45-67`.
- For a number without WhatsApp, the user sees «На этом номере нет WhatsApp» and no chat is created.
- The user types «Привет» and presses Enter; the bubble appears with 🕓 and turns ✅, and the message arrives on the recipient's phone.
- When sending fails, the bubble shows ❗ «Не отправлено · Повторить», and «Повторить» sends it again.
- After a reload, the chat list and the messages are still there; after logout and sign-in again, they are gone.

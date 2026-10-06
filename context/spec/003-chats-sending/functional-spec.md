# Functional Specification: Chats & Sending

- **Roadmap Item:** Phase 1 → Chats & Sending (WhatsApp Web-style layout, new chat by phone number, sending text messages with status, chats saved across reloads)
- **Status:** Draft
- **Author:** Alexander Shleyko
- **Ticket:** TKT-4 · **Source:** `context/inbox/chats-sending.md` (grill decisions D1–D10)

---

## 1. Overview and Rationale (The "Why")

Steps 2 and 3 of the brief: the user enters the recipient's phone number, creates a chat, writes a text message and sends it to the recipient in WhatsApp. This feature fills the empty main screen from "Sign-In & Session" with a chat list and a conversation: the user starts a chat, sees their messages as WhatsApp-style bubbles, and always knows whether each message went out. Checking for WhatsApp before a chat is created stops the user from writing into a number that can never receive anything.

The interface stays in Russian and as simple as WhatsApp Web.

**Success looks like:** the user starts a chat with a WhatsApp number in a few clicks, sends «Привет», sees ✅, and the message arrives on the recipient's phone. The chats are still there after a reload.

---

## 2. Functional Requirements (The "What")

### 2.1. Starting a chat

- The left column's header has a **«+»** button. It opens a row at the top of the chat list with a **country picker**, a **phone number field** and a **«Начать чат»** button.
- The country picker lists: 🇷🇺 Россия +7 (selected by default), 🇰🇿 Казахстан +7, 🇧🇾 Беларусь +375, 🇺🇦 Украина +380, 🇺🇿 Узбекистан +998, 🇦🇲 Армения +374, 🇬🇪 Грузия +995, 🇷🇸 Сербия +381, 🇹🇷 Турция +90, 🇩🇪 Германия +49, 🇺🇸 США +1, and **«Другая страна»**. Choosing «Другая страна» shows a small field for the country code (digits only, at least one).
- The user types the number **without the country code** (for Russia: `9037474411`). Spaces, brackets and dashes are ignored. «Начать чат» is active once the number contains at least one digit and nothing but digits after those characters are removed. There's no check on how many digits there are.
- Pressing Enter in the number field is the same as clicking «Начать чат».
- While the WhatsApp check is running, the picker, the field and the button are locked, and the button reads «Проверяем…».
- If a chat with that number already exists, it simply opens.
- Otherwise the app first checks that the number uses WhatsApp:
  - if it does, the chat is created, appears at the top of the list, and opens;
  - if it doesn't, the user sees «На этом номере нет WhatsApp», and no chat is created;
  - if the check can't be completed, the user sees «Не удалось проверить номер. Попробуйте ещё раз.», and no chat is created.

  When the chat opens, the new-chat row closes. When no chat is created, the row stays open and the number stays in the field.
  - **Acceptance Criteria:**
    - [ ] When the signed-in user clicks «+», then a row with the country picker set to 🇷🇺 Россия +7, an empty number field and «Начать чат» appears at the top of the chat list.
    - [ ] Given Россия +7 is selected, when the user types `903 747-44-11` and clicks «Начать чат» for a number that uses WhatsApp, then a chat titled `+7 903 747-44-11` appears at the top of the list and opens.
    - [ ] Given a number that doesn't use WhatsApp, when the user clicks «Начать чат», then they see «На этом номере нет WhatsApp», no chat appears, and the number is still in the field.
    - [ ] Given the WhatsApp check can't be completed, when the user clicks «Начать чат», then they see «Не удалось проверить номер. Попробуйте ещё раз.» and no chat appears.
    - [ ] Given a chat with `+7 903 747-44-11` exists, when the user starts a chat with the same number again, then that existing chat opens and no second entry appears in the list.
    - [ ] When the user picks «Другая страна», types `381` as the code and `629443720` as the number, and the number uses WhatsApp, then a chat titled `+381629443720` opens.
    - [ ] When the user types letters into the number field, then «Начать чат» stays inactive.
    - [ ] While the WhatsApp check is running, when the user tries to edit the number or click again, then nothing changes and the button reads «Проверяем…».

### 2.2. Chat list

- Each chat in the list shows the number, its last message cut to one line, and the time of that message. The newest activity is at the top. A new chat with no messages yet shows no preview and no time, and is placed by when it was created. Numbers starting with +7 are shown as `+7 903 747-44-11`; all other numbers are shown as `+` and the digits, e.g. `+381629443720`.
- Clicking a chat opens it in the right area and highlights it in the list. With no chats yet, the list shows «Нет чатов. Нажмите «+», чтобы начать». While no chat is open, the right area shows «Выберите чат, чтобы начать переписку».
  - **Acceptance Criteria:**
    - [ ] Given two chats, when the user sends a message in the one lower in the list, then that chat moves to the top and shows the message and its time.
    - [ ] Given no chats, when the user looks at the left column, then they see «Нет чатов. Нажмите «+», чтобы начать».

### 2.3. Conversation and sending

- An open chat shows the number in its header, the messages as bubbles, and a message box at the bottom with the placeholder «Введите сообщение».
- Sent messages are light-green bubbles on the right. Each shows the text, its time as `HH:MM`, and a mark: **🕓** while sending; **✅** once GREEN-API has accepted the message for sending (this doesn't mean it was delivered or read); **❗** with «Не отправлено · Повторить» when sending was refused; **❔** with «Статус неизвестен · Повторить» when the outcome is unknown (no answer, the connection dropped while sending, or the page was closed while sending). Clicking «Повторить» sends the same message again and the mark goes back to 🕓. For an unknown-status message, «Повторить» first asks «Сообщение могло уже уйти. Отправить ещё раз?». Nothing is ever resent automatically.
- Enter sends the message; Shift+Enter adds a new line. A message that's empty or only spaces isn't sent. After sending, the box clears.
- The message box grows with the text up to 6 lines; after that it scrolls inside.
- The conversation scrolls to the newest message whenever the user sends one.
  - **Acceptance Criteria:**
    - [ ] Given an open chat, when the user types «Привет» and presses Enter, then a right-hand bubble «Привет» appears with the current time and 🕓, which turns into ✅ once GREEN-API accepts it, and the box is empty again.
    - [ ] Given GREEN-API refuses the message, when the user looks at the bubble, then it shows ❗ and «Не отправлено · Повторить», and when they click «Повторить» and sending succeeds, then the same bubble shows ✅.
    - [ ] Given GREEN-API doesn't answer while sending, when the user looks at the bubble, then it shows ❔ «Статус неизвестен · Повторить», and when they click «Повторить», then they are asked «Сообщение могло уже уйти. Отправить ещё раз?» before anything is sent.
    - [ ] When the user presses Shift+Enter between two lines and then Enter, then one bubble shows both lines.
    - [ ] When the user presses Enter in an empty box, or one with only spaces, then nothing is sent.
    - [ ] When the user types 10 lines, then the box stops growing at 6 lines and scrolls inside.

### 2.4. Chats kept across reloads

- Chats and messages stay in this browser after a reload. A message that was still being sent when the page was closed shows ❔ «Статус неизвестен · Повторить» after the reload; it isn't resent by itself. Each chat keeps its unsent text in the message box when the user switches to another chat and after a reload. Logging out removes all chats, messages and unsent texts from this browser.
  - **Acceptance Criteria:**
    - [ ] Given two chats with messages, when the user reloads the page, then both chats and all their messages are still there with their marks.
    - [ ] Given a message still shows 🕓, when the page is reloaded, then that message shows ❔ and «Статус неизвестен · Повторить».
    - [ ] Given the user typed «черновик» in chat A without sending, when they open chat B, come back to A and reload the page, then «черновик» is still in chat A's message box.
    - [ ] Given chats exist, when the user clicks «Выйти» and signs in again, then the chat list shows «Нет чатов. Нажмите «+», чтобы начать».

### 2.5. Real WhatsApp delivery

- A message sent from the app arrives in the recipient's WhatsApp.
  - **Acceptance Criteria:**
    - [ ] Given a signed-in real instance, when the user starts a chat with their second WhatsApp number and sends «Привет», then the bubble shows ✅ and «Привет» arrives on that phone.

---

## 3. Scope and Boundaries

### In-Scope

- «+», the country picker (the short list plus «Другая страна»), the national number field, the WhatsApp check when a chat is created, opening an existing chat.
- The chat list with the number, last message and time, newest first; +7 numbers formatted.
- The conversation: outgoing bubbles with time and emoji marks, «Повторить», a growing message box with Enter / Shift+Enter.
- Chats and messages kept across reloads; cleared on logout.

### Out-of-Scope

- Incoming messages, and new chats for unknown senders: "Receiving Replies".
- Chat history from GREEN-API: "Chat History" (stretch).
- The "connection lost" banner and one-active-tab behaviour: Phase 2.
- Contact names, avatars, read ticks ✓✓, deleting or editing, media, groups, a mobile layout.
- A full country list, checking number length per country, turning a leading `8` into `7`, formatting non-+7 numbers.
- Re-checking WhatsApp for existing chats; automatic resends.

---

## Change Log

_Dated amendments made after the spec was first written — typically by `/awos:spec` in Update Mode when a bug fix changed documented behavior. Each entry records the date, the source reference (bug id or fix description), and what behavior changed and why. Leave empty until the first amendment._
- 2026-10-06 — review `spec-codex` stage 2 — §2.1: custom code digits only; locked «Проверяем…» while checking. §2.2: empty chats and no-selection placeholder. §2.3: ✅ = accepted by GREEN-API; ❔ «Статус неизвестен» for unknown outcomes, with a confirmation before resending. §2.4: ❔ after reload; per-chat unsent text kept.
- 2026-10-06 — tech consult open question — §2.1: the new-chat row closes when the chat opens; the number stays only when no chat is created (the earlier "in every case" wording was ambiguous).

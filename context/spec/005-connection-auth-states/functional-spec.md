# Functional Specification: Connection & Authorization States

- **Roadmap Item:** Phase 2 → Connection & Authorization States (connection-lost banner with auto-recovery; instance-lost-authorization handling)
- **Status:** Draft
- **Author:** Alexander Shleyko
- **Ticket:** TKT-8 · **Source:** `context/inbox/connection-auth-states.md` (grill decisions D1–D6)

---

## 1. Overview and Rationale (The "Why")

While the user is signed in, things can go wrong that the chat screen currently doesn't show. The internet drops. WhatsApp logs the instance out (this happened during testing, and the app kept showing ✅ for messages that were only waiting in GREEN-API's queue). The access key gets replaced in the console. Or receiving keeps failing for some other reason. In each case the user saw nothing, sent messages that went nowhere, and waited for replies that couldn't arrive.

This feature makes each of these states visible with one clear banner. It pauses sending when a message couldn't go out anyway, and clears itself when things recover. Chats, messages and the unsent text are never lost.

**Success looks like:** the user always knows why replies aren't arriving or why they can't send, and what to do about it. No message gets a misleading ✅ while the instance is logged out.

---

## 2. Functional Requirements (The "What")

### 2.1. One banner at a time

- A banner appears at the top of the right-hand area (above the open chat, or above «Выберите чат, чтобы начать переписку»). Only **one** is shown at a time, by priority:
  1. the access key no longer works (§2.4);
  2. the instance isn't authorized (§2.3);
  3. no connection (§2.2);
  4. receiving is stuck (§2.5).
- When the higher-priority problem clears, the next one still present shows; when none remain, the banner disappears.
  - **Acceptance Criteria:**
    - [ ] Given there's no connection and the instance is also reported as not authorized, when the user looks at the screen, then they see only the «Инстанс не авторизован…» banner, and when the instance is authorized again while still offline, then the banner changes to «Нет соединения. Переподключаемся…».
    - [ ] Given no chat is open, when a banner appears, then it's shown above «Выберите чат, чтобы начать переписку».

### 2.2. No connection

- When the device goes offline, or when two attempts in a row to get new messages fail because the network can't be reached, the user sees **«Нет соединения. Переподключаемся…»** within 3 seconds.
- It disappears by itself as soon as the app reaches GREEN-API again. Replies sent in the meantime then appear (as in "Receiving Replies").
  - **Acceptance Criteria:**
    - [ ] Given the user is signed in, when the internet connection is turned off, then within 3 seconds they see «Нет соединения. Переподключаемся…».
    - [ ] Given the «Нет соединения» banner is shown, when the internet connection is turned back on, then the banner disappears within 10 seconds without a reload, and replies sent meanwhile appear.

### 2.3. Instance not authorized

- When GREEN-API reports that the instance has been logged out of WhatsApp, the user sees a **red** banner **«Инстанс не авторизован. Отсканируйте QR-код в консоли GREEN-API.»** It disappears by itself when the instance is authorized again.
- The chats and messages stay visible. The user isn't signed out.
  - **Acceptance Criteria:**
    - [ ] Given the user is signed in, when GREEN-API reports the instance as logged out, then the red banner «Инстанс не авторизован. Отсканируйте QR-код в консоли GREEN-API.» appears and the chat list and messages stay as they were.
    - [ ] Given the red banner is shown, when GREEN-API reports the instance as authorized again, then the banner disappears without a reload.

### 2.4. Access key no longer works

- When GREEN-API stops accepting the access key while the user is signed in (e.g. it was replaced in the console), the user sees **«Ключ доступа больше не действует. Войдите заново.»** with a **«Выйти»** button. The user isn't signed out automatically.
  - **Acceptance Criteria:**
    - [ ] Given the user is signed in, when the access key is replaced in the GREEN-API console, then the banner «Ключ доступа больше не действует. Войдите заново.» with «Выйти» appears, and when the user clicks «Выйти», then they see the empty sign-in form.

### 2.5. Receiving stuck

- When getting new messages has kept failing for **1 minute** for a reason other than a lost connection or a bad access key, the user sees a **grey** banner **«Не удаётся получить новые сообщения. Пробуем снова…»**. It disappears as soon as receiving works again.
  - **Acceptance Criteria:**
    - [ ] Given GREEN-API keeps answering with an error for over a minute while the connection is fine, when the user looks at the screen, then they see the grey banner «Не удаётся получить новые сообщения. Пробуем снова…», and when GREEN-API answers normally again, then the banner disappears.
    - [ ] Given errors have lasted less than a minute, when the user looks at the screen, then no grey banner is shown.

### 2.6. Sending paused

- While the banner from §2.2, §2.3 or §2.4 is shown, **messages can't be sent**. The message box stays usable and keeps the typed text, but Enter doesn't send. Its placeholder explains why:
  - no connection: «Нет соединения — сообщение можно будет отправить позже»;
  - not authorized: «Инстанс не авторизован — отправка недоступна»;
  - access key: «Ключ доступа не действует — отправка недоступна».
- Starting a new chat («Начать чат») is unavailable for the same reasons.
- Nothing is queued or resent automatically. When the banner clears, the user presses Enter to send what they typed.
- The grey "receiving stuck" banner (§2.5) doesn't pause sending.
  - **Acceptance Criteria:**
    - [ ] Given the «Нет соединения» banner is shown and the user has typed «Привет», when they press Enter, then nothing is sent, «Привет» stays in the box, and the placeholder of an empty box reads «Нет соединения — сообщение можно будет отправить позже».
    - [ ] Given the «Инстанс не авторизован» banner is shown, when the user presses Enter in a chat, then no bubble appears.
    - [ ] Given the banner has just disappeared and «Привет» is still in the box, when the user presses Enter, then «Привет» is sent as usual.
    - [ ] Given the «Нет соединения» banner is shown, when the user opens «+» and tries «Начать чат», then no chat is created.
    - [ ] Given only the grey «Не удаётся получить новые сообщения…» banner is shown, when the user presses Enter with text in the box, then the message is sent as usual.

---

## 3. Scope and Boundaries

### In-Scope

- The four banners with their texts and priority; showing one at a time; clearing by themselves.
- Pausing sending and new chats under the first three banners, keeping the typed text, and explaining why in the placeholder.
- Detecting a logged-out instance while signed in, a replaced access key, and receiving that keeps failing.

### Out-of-Scope

- One active tab and logging out everywhere: "One Active Tab".
- Changing messages already marked ✅ while the instance was logged out.
- Queuing messages to send later; sound or push notifications; banners on the sign-in screen.
- The README, demo and submission: Phase 3. Chat history: stretch.

---

## Change Log

_Dated amendments made after the spec was first written — typically by `/awos:spec` in Update Mode when a bug fix changed documented behavior. Each entry records the date, the source reference (bug id or fix description), and what behavior changed and why. Leave empty until the first amendment._

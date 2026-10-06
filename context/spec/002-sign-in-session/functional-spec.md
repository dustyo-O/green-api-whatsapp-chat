# Functional Specification: Sign-In & Session

- **Roadmap Item:** Phase 1 → Sign-In & Session (Credentials Login with Readiness Check; Remembered Session & Logout)
- **Status:** Draft
- **Author:** Alexander Shleyko
- **Ticket:** TKT-2 · **Source:** `context/inbox/sign-in-session.md` (grill decisions D1–D11)

---

## 1. Overview and Rationale (The "Why")

A reviewer's first step in the brief is "enter your GREEN-API credentials". The most common way this kind of app fails a reviewer is that sign-in seems to work, but replies never arrive, because the instance isn't authorized or isn't set up to deliver incoming messages. This feature lets the user in only when their instance can really send and receive. When it can't, the user is told exactly what to fix in the GREEN-API console.

The session is remembered so a page reload doesn't send the user back to the form, and logging out is one click.

The interface is in Russian, matching what reviewers see in their own WhatsApp.

**Success looks like:** with a real, ready instance, the user is signed in within a few seconds of pressing the button. Every common setup problem produces its own message instead of a generic error.

---

## 2. Functional Requirements (The "What")

### 2.1. Sign-in form

- The sign-in screen has three fields, in this order: **idInstance**, **apiTokenInstance** (hidden as dots, with a show/hide toggle), and **API URL**.
- The API URL fills itself in from the first four digits of idInstance (for `7103123456` → `https://7103.api.greenapi.com`; empty until four digits are typed) and can't be edited. A checkbox **«Указать API URL вручную»** makes it editable. Unticking it puts the filled-in value back.
- Spaces at the start and end of every field are ignored.
- The **«Войти»** button is active only when idInstance is digits only, apiTokenInstance isn't empty, and the API URL is a plain address like `https://7103.api.greenapi.com`: it starts with `https://`, and has no extra path, `?` or `#` part (a trailing `/` is ignored). A short hint appears under a field once something is typed into it that doesn't meet this: «Только цифры, например 7103123456.» for idInstance, «Полный адрес, начинающийся с https://» for the API URL. Empty fields just keep «Войти» inactive.
  - **Acceptance Criteria:**
    - [ ] When the user types `7103123456` into idInstance, then the API URL field shows `https://7103.api.greenapi.com` and can't be edited.
    - [ ] Given the API URL is filled in automatically, when the user ticks «Указать API URL вручную» and types another address, then the field accepts it, and when they untick it again, then the field shows `https://7103.api.greenapi.com` again.
    - [ ] When the user types letters into idInstance, then a hint appears under the field and «Войти» stays inactive.
    - [ ] Given «Указать API URL вручную» is ticked, when the user enters just `https://`, then a hint appears under the API URL and «Войти» stays inactive.
    - [ ] When the user clicks the show/hide toggle on apiTokenInstance, then the token switches between dots and readable text.

### 2.2. Signing in only with a ready instance

- After «Войти», the app checks the instance. The user gets in only if the instance is authorized in WhatsApp **and** set up to deliver incoming messages to this app.
- Otherwise the user stays on the form, with everything they typed kept. One message explains the problem, and a **«Проверить снова»** button repeats the check. The app never changes the instance's settings itself.
- Messages:

| Situation | Message shown |
|---|---|
| idInstance or apiTokenInstance is wrong | «Неверный idInstance или apiTokenInstance.» |
| The API URL can't be reached (wrong address or no internet) | «Не удалось связаться с {API URL}. Проверьте API URL в консоли GREEN-API и подключение к интернету.» |
| The instance isn't authorized | «Инстанс не авторизован. Отсканируйте QR-код в консоли GREEN-API.» |
| The phone is offline (sleep mode) | «Телефон с WhatsApp не в сети. Включите его и проверьте снова.» |
| The instance is starting | «Инстанс запускается. Попробуйте через минуту.» |
| The instance is blocked | «Инстанс заблокирован. Проверьте его в консоли GREEN-API.» |
| The instance is temporarily restricted | «Работа инстанса временно ограничена. Проверьте его в консоли GREEN-API.» |
| A webhook address is set, so incoming messages go elsewhere | «Входящие сообщения уходят на webhook. Очистите поле Webhook URL в настройках инстанса в консоли GREEN-API.» |
| Incoming-message notifications are switched off | «Уведомления о входящих сообщениях выключены. Включите их в настройках инстанса в консоли GREEN-API.» |
| Anything else goes wrong, or there's no answer within 15 seconds | «Не удалось проверить инстанс. Попробуйте ещё раз.» |

  - **Acceptance Criteria:**
    - [ ] Given an authorized instance that's ready to receive, when the user enters its idInstance and apiTokenInstance and clicks «Войти», then they see the main screen (§2.3), usually within 5 seconds on a normal connection and at most 15 seconds.
    - [ ] Given a wrong apiTokenInstance, when the user clicks «Войти», then they see «Неверный idInstance или apiTokenInstance.» and the three fields still hold what they typed.
    - [ ] Given an API URL that doesn't belong to the instance, or no internet connection, when the user clicks «Войти», then they see «Не удалось связаться с …» naming that API URL.
    - [ ] Given an instance that isn't authorized, when the user clicks «Войти», then they see «Инстанс не авторизован. Отсканируйте QR-код в консоли GREEN-API.», and when they authorize it in the console and click «Проверить снова», then they see the main screen.
    - [ ] Given an instance with a webhook address set, when the user clicks «Войти», then they see the webhook message, and the same holds for incoming-message notifications being off.
    - [ ] Given GREEN-API doesn't answer, when 15 seconds pass after «Войти», then the user sees «Не удалось проверить инстанс. Попробуйте ещё раз.», their input is kept and «Проверить снова» is available.
    - [ ] While the check is running, when the user looks at the form, then «Войти» shows that it is working and can't be clicked twice.

### 2.3. Main screen after sign-in

- After sign-in the user sees the empty WhatsApp Web-style layout. The left column's header shows **«Инстанс {idInstance}»** and a **«Выйти»** button. The right area shows **«Выберите чат, чтобы начать переписку»**. There are no chats yet (a later feature).
  - **Acceptance Criteria:**
    - [ ] When the user signs in with idInstance `7103123456`, then the left header shows «Инстанс 7103123456» with a «Выйти» button, and the right area shows «Выберите чат, чтобы начать переписку».

### 2.4. Remembered session

- The user stays signed in in this browser. On a reload, a short **«Проверяем инстанс…»** screen appears while the saved credentials are checked again. If they're still fine, the main screen opens. If not, the sign-in form appears filled in with the saved values, showing the matching message from §2.2. If the saved values can't be read, the empty sign-in form appears.
  - **Acceptance Criteria:**
    - [ ] Given the user is signed in, when they reload the page, then they briefly see «Проверяем инстанс…» and then the main screen, without typing anything.
    - [ ] Given the user is signed in and the instance has since been logged out in the console, when they reload the page, then they see the sign-in form filled in with their values and «Инстанс не авторизован. …».

### 2.5. Logout

- **«Выйти»** signs the user out with one click and no confirmation. The browser forgets the saved credentials.
  - **Acceptance Criteria:**
    - [ ] Given the user is signed in, when they click «Выйти», then they see the sign-in form with all fields empty, and when they reload the page, then the sign-in form is still shown.

---

## 3. Scope and Boundaries

### In-Scope

- The Russian sign-in form with the three fields, the filled-in API URL with its manual override, simple field checks and the masked token.
- Checking the instance on sign-in and on every reload, with one message per problem and «Проверить снова».
- The empty main screen with the instance number and «Выйти».
- Remembering the session in this browser; one-click logout.

### Out-of-Scope

- Chats, starting a chat by phone number, sending and receiving messages: "Chats & Sending", "Receiving Replies".
- The "connection lost" banner while signed in, and one-active-tab behaviour: "Connection & Authorization States", "One Active Tab".
- README instance prerequisites, the demo and the submission: "Documentation", "Public Delivery", "Submission".
- Logging out in one tab while another tab is checking or signed in ("One Active Tab → Logout Everywhere").
- A message for browsers that refuse to save data.
- Changing the instance's settings from the app, automatic retries, more than one instance, an English interface and a logout confirmation.

---

## Change Log

_Dated amendments made after the spec was first written — typically by `/awos:spec` in Update Mode when a bug fix changed documented behavior. Each entry records the date, the source reference (bug id or fix description), and what behavior changed and why. Leave empty until the first amendment._
- 2026-10-05 — review `spec-codex` (stage 2) — §2.1: API URL must be a complete https address, empty until 4 digits; §2.2: catch-all message + 15 s limit; §2.4: unreadable saved data → empty form; cross-tab logout and save-failure message moved out of scope.
- 2026-10-05 — tech consult open questions 1 and 3 — §2.1: hint texts fixed, and hints appear only for typed-in invalid values (recommended answers, user rule: avoid overengineering).
- 2026-10-05 — review `spec-codex-20261005-2100` (stage 3) — §2.1: API URL must be a plain address (no path, `?`, `#`); §2.2: sign-in timing is "usually ≤ 5 s, at most 15 s".

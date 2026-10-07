# Connection & Authorization States — grill notes 2026-10-07

Ticket: **TKT-8** (context/inbox/TICKETS.md) · Roadmap: Phase 2 → "Connection & Authorization States" · Builds on specs 002–004. User accepted every recommendation.

## Decisions

- D1 (Q1): **«Нет соединения. Переподключаемся…»** appears at the top of the conversation area as soon as the browser reports going offline, **or** after 2 receive attempts in a row fail on the network (about 3 s). It disappears by itself on the first successful answer.
- D2 (Q2): **Sending is paused** while a banner from D1, D3 or D4 is shown. The message box stays usable and the draft is kept, but Enter doesn't send, and the placeholder reads **«Нет соединения — сообщение можно будет отправить позже»** (D3 and D4 get their own placeholder wording in the spec). Nothing is queued or resent automatically.
- D3 (Q3, Q4): **Instance logged out:** detected from the state-change notification that arrives in the receive queue, plus the existing check on every reload. A red banner reads **«Инстанс не авторизован. Отсканируйте QR-код в консоли GREEN-API.»** Sending is paused (D2). Chats stay visible. The banner disappears by itself when the instance is authorized again. If GREEN-API only sends that notification with a setting switched on, the fallback is re-checking the instance every 5 minutes (the tech stage decides).
- D4 (Q5): **The token stops working** (every call 401): a banner **«Ключ доступа больше не действует. Войдите заново.»** with a **«Выйти»** button. Sending is paused. The user is not signed out automatically.
- D5 (Q6): **Receiving stuck:** after **1 minute** of failures in a row that aren't network or 401 (GREEN-API errors, a broken notification), a grey banner reads **«Не удаётся получить новые сообщения. Пробуем снова…»**. Sending isn't paused for this one. It disappears on recovery.
- D6 (Q7): **One banner at a time**, by priority: token invalid (D4) > not authorized (D3) > no connection (D1) > receiving stuck (D5).

## Out of scope

- One active tab and logout everywhere (its own Phase 2 spec).
- Changing messages already marked ✅ while the instance was logged out (they were queued by GREEN-API).
- Sound or push notifications; any banner on the sign-in screen (sign-in already has its own messages).

## Open risks

- **Whether GREEN-API always queues `stateInstanceChanged`**, or needs a setting switched on (the user's console settings didn't show one by that name). This decides D3's approach versus the 5-minute fallback. The tech consult checks the docs.
- **Telling "offline" from "GREEN-API down":** the browser's `offline`/`online` events are reliable for the device, but a network `TypeError` can also be a CORS-less error page.
- **401 vs 403** after a token rotation: which one GREEN-API returns for a changed token on a valid instance.
- The real "logged out" check needs a linkable instance (TKT-5). A real token-rotation check works without one.

## Suggested acceptance criteria

- With the network turned off, «Нет соединения. Переподключаемся…» appears within 3 s, and Enter doesn't send; with the network back, it disappears and replies arrive again.
- When GREEN-API reports the instance logged out, the red «Инстанс не авторизован…» banner appears and sending is paused; when it's authorized again, the banner goes away by itself.
- After the token is rotated in the console, the banner «Ключ доступа больше не действует. Войдите заново.» with «Выйти» appears.
- After 1 minute of non-network receive failures, the grey «Не удаётся получить новые сообщения…» banner appears, and it disappears once receiving works again.
- With two problems at once, only the higher-priority banner shows.

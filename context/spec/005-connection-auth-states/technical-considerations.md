<!--
This document describes HOW to build the feature at an architectural level.
It is NOT a copy-paste implementation guide.
-->

# Technical Specification: Connection & Authorization States

- **Functional Specification:** [functional-spec.md](functional-spec.md)
- **Status:** Draft
- **Author(s):** Alexander Shleyko (lead) · `react-frontend` consult: [consults/](consults/) (`react-frontend-tech-banners-*.md`; GREEN-API docs 2026-10-07)

---

## 1. High-Level Technical Approach

A small non-persisted **status store** holds four conditions:
- `keyInvalid`;
- `instanceState`;
- `noConnection`;
- `stuck`.

A priority selector (`bannerOf`) turns them into the one banner to show, and `pausedBy` says whether sending is paused.

Three writers keep the store up to date:
- **The receive loop** (spec 004) classifies every answer, listens for the device's `offline`/`online` events, and maps `stateInstanceChanged` notifications to the instance state.
- **A new state watch** checks `getStateInstance` every 4 minutes as the fallback that guarantees "within 5 minutes".
- **`reset()`** clears everything on mount and unmount.

Sending is paused by a guard in the store actions `send`/`retry` and in `NewChatForm`. A `Banner` component sits at the top of the right-hand area. There are no new dependencies, and tests are Vitest + RTL + MSW only.

---

## 2. Proposed Solution & Implementation Plan (The "How")

### 2.1. Logout detection (docs, 2026-10-07)

- `stateInstanceChanged` is queued **only when the instance's `stateWebhook` setting is `yes`**: the console option "Receive notifications about the instance authorization state change". GREEN-API's docs say all settings are off by default on a new instance. The user's instance has it on (a real one was read in spec 004 slice 1). A reviewer's may not.
- The design does **both**, with no branching on the setting:
  - **The notification (fast path):** a pure `toStateChange(body)` in `src/chat/notification.ts` returns `stateInstance` if `typeWebhook === "stateInstanceChanged"` and the value is one of `notAuthorized | authorized | blocked | sleepMode | starting | yellowCard | suspended`, else `null`. The loop sets the state, then deletes the notification as before.
  - **The watch (the bound):** `src/chat/state-watch.ts` → `watchInstanceState(creds, signal)`. It sleeps **4 min**, calls `getStateInstance` with a 15 s budget, and repeats. **A failed check (timeout, 429, 5xx, network) retries every 30 s until one succeeds**, then goes back to 4 min (review 3 F2); the 5-minute promise holds while GREEN-API can be reached. The worst case is about 4 min 15 s, which is under the spec's 5 min, for both the logout and the recovery. The first check runs 4 min after mount, so it never collides with sign-in's own `getStateInstance` (1 rps limit). It starts from the same `MainScreen` effect as the receive loop and stops on the same `AbortController`.

### 2.2. Response → condition mapping (review F3)

| Outcome | receive / delete | `getStateInstance` (watch) | `sendMessage` / `checkWhatsapp` |
|---|---|---|---|
| 2xx with a valid body | **reachable**: clears `noConnection` and `keyInvalid`, resets the network streak. An empty poll or a successful delete (incl. `result:false` and the 500 "not found") also counts as **works**, which clears `stuck` | reachable; sets `instanceState` if the value is one of the 7 known ones | no state change |
| 401, or 403 with CORS | **`keyInvalid`** (no streak; a valid token never gets a CORS 401). 403 is treated like sign-in's `wrongCredentials` (lead decision, consult open question 2) | `keyInvalid` | no state change (existing ❗/«Не удалось проверить…») |
| `TypeError` (network) or a **budget** timeout | **network failure**: two in a row → `noConnection` | ignored | no state change (existing ❔) |
| A timeout from a **wake or abort** (`online`, logout) | **not a failure**: `continue` with no backoff and no counting (changes today's loop, which counts it) | — | — |
| 429, 5xx (other than the delete "not found"), `badBody`, a save that throws | **stuck clock** + backoff | ignored | no state change |

- **`noConnection` is set by** two network failures in a row, a device `offline` event, or `navigator.onLine === false` at loop start. It's cleared by the next **reachable** answer, not by the `online` event, which only wakes the loop.
- **The bounds, worst case:**
  - device offline → banner at once (≤ 3 s);
  - a stalled upstream with no `offline` → 8 s budget + 1 s backoff + 8 s budget, about 17 s (≤ 20 s);
  - recovery → `online` wakes the loop, and the poll comes back empty within 5 s (≤ 10 s). After an upstream cut with no `online` event, recovery takes up to about 18 s, within the 20 s of functional §2.2 (user decision b, spec 004; review 3 F1).
- **`stuck`:** the first stuck-clock failure starts a **cancellable 60 s timer** that sets `stuck` when it fires (review 3 F3).
  - Later stuck-clock failures don't restart it.
  - Only **works** (an empty poll or a successful delete) or the end of the session cancels the timer and clears `stuck`. A received but undeleted notification doesn't (review F6).
  - Network and key failures neither start nor reset it.
- **Writes stop after the session ends** (the existing session guard), so a late answer can't raise a banner on the sign-in screen.

### 2.3. Status store (`src/chat/status-store.ts`, Zustand, **no persist**)

- **State:** `{ keyInvalid: boolean; instanceState: string /* "authorized" initially */; noConnection: boolean; stuck: boolean; set…; reset() }`.
- **`bannerOf(s)`** picks by priority: `key` (keyInvalid) > `auth` (instanceState ≠ authorized) > `offline` > `stuck` > `null`.
- **`pausedBy(s)`** returns the same, minus `stuck`.
- **Auth texts:** export `stateError` from `src/auth/check-instance.ts` and use `checkErrorMessage(stateError(state), apiUrl)` from `messages.ts`. These are the same per-state texts as sign-in; `suspended`/`yellowCard` → «Работа инстанса временно ограничена…».
- **`reset()`** runs at the start and in the cleanup of the `MainScreen` effect. Logout unmounts `MainScreen`, and `session-store` is unchanged.

### 2.4. Sending paused (review F4)

- **The guard lives in the store:** `useChats.send` and `useChats.retry` return early, **before** any change, when `pausedBy(useStatus.getState()) !== null`. No bubble is created, the draft stays, and ❗ stays ❗. This covers Enter and «Повторить» in one place. The import goes one way, chats → status.
- **`NewChatForm`:** submit returns early while paused, and «Начать чат» is `disabled`. This also blocks opening an existing chat through the form, which is harmless. **It also re-checks `pausedBy` after `checkWhatsapp` answers and before `addChat`/`select`, keeping the number in the field** (review 3 F4).
- **«Повторить»** is `disabled={paused}` as a UI hint; the store guard is the real one.
- **`Composer`:** `placeholder` comes from the paused reason:
  - `offline` → «Нет соединения — сообщение можно будет отправить позже»;
  - `auth` → «Инстанс не авторизован — отправка недоступна»;
  - `key` → «Ключ доступа не действует — отправка недоступна»;
  - otherwise «Введите сообщение».

  The textarea stays enabled, so the draft can still be edited.
- **In-flight sends:** the guard only applies at the entry point. `settle()` is unchanged, so a send already on its way finishes with GREEN-API's answer.

### 2.5. UI

- **`src/chat/Banner.tsx` + css:** reads `bannerOf(useStatus)`. It renders nothing for `null`, otherwise `<div role="status">` with the text, plus a «Выйти» button (`useSession.signOut`) for `key`.
- **Variants:** `key`/`auth` red, `offline` yellow (like WhatsApp Web's "not connected" strip), `stuck` grey.
- **`MainScreen.tsx`:** the right-hand side becomes a flex column: `<Banner/>`, then the intro or `<Conversation/>` (`flex: 1`, `min-height: 0`).
- **Tokens (light / dark):**

  | Token | Light | Dark | Text |
  |---|---|---|---|
  | `--color-banner-danger` | `#fde8ea` | `#3b2027` | `--color-danger` |
  | `--color-banner-warning` | `#fff3c4` | `#3d3520` | `--color-text` |
  | `--color-banner-muted` | `#e9edef` | `#2a3942` | `--color-text-muted` |

---

## 3. Impact and Risk Analysis

- **System Dependencies:**
  - The spec 004 receive loop (error classification, the wake handling);
  - The spec 003 store actions `send`/`retry` and `NewChatForm`;
  - spec 002's per-state texts and `signOut`;
  - GREEN-API's `getStateInstance` (rate limit 1 rps).
- **Potential Risks & Mitigations** (riskiest first; slice 1 takes #1):
  1. **What receiving returns while the instance is logged out.** If it's a CORS 4xx instead of 200, the mapping would show the **key** banner instead of the auth one. *Mitigation:* slice 1 = the store, the mapping and the banner, plus a `[User]` token-safe probe of **both** conditions: `receiveNotification?receiveTimeout=5` and `getStateInstance` on the user's still-logged-out instance, **and** the same two calls with a deliberately wrong token (status and body shape only). **Disambiguation rule if the two overlap** (review 3 F5): a 4xx on receive triggers **one** `getStateInstance`. A state comes back → `auth`; 401/403 again → `key`; the check fails → keep the current banner and retry on the next cycle.
  2. **`stateWebhook` off on a reviewer's instance.** *Mitigation:* the 4-minute watch (by design). The README (Phase 3) can recommend turning it on for an instant banner.
  3. **Stale `stateInstanceChanged` backlog after sign-in** (an old `notAuthorized`, then `authorized`) briefly flickers the red banner while the queue drains. If no matching `authorized` was ever queued, the banner stays wrong until the next watch check (≤ 4 min). Accepted.
  4. **A CORS 403 that means something else** (e.g. an expired instance) shows the key banner with «Выйти». This is consistent with sign-in; accepted.
  5. **A wake-abort counted as a network failure** would flash «Нет соединения» on every `online` event. *Mitigation:* the loop change in §2.2, plus a unit test.
  6. **Fake-timer flakiness** with `Date` faked alongside MSW. *Mitigation:* an explicit `toFake`, the spec 004 pattern, and unmounting old roots.
  7. **Several tabs** each run a watch, so they can hit the 1 rps limit. A 429 is ignored and the next check comes 4 min later. The "One Active Tab" spec removes this.

---

## 4. Testing Strategy

- **Unit:**
  - `status-store.test.ts`: `bannerOf` over all 16 combinations, and `pausedBy`.
  - `notification.test.ts`: `toStateChange` for each known state, an unknown value, and the real slice-1 body.
  - `receive-loop.test.ts`: one case per row of §2.2, with fake timers `["setTimeout","clearTimeout","Date"]`; "a wake-abort is not a failure".
  - `state-watch.test.ts`: the check runs at 4 min and not before; 401 → `keyInvalid`; a `TypeError` is ignored; abort stops it.
- **Integration** (`src/chat/connection.test.tsx`, the `loadPage` pattern with unmount on reload): one test per functional criterion. That's §2.1 c1–c2, §2.2 c1–c3, §2.3 c1–c4, §2.4 c1, §2.5 c1–c3 and §2.6 c1–c6. The consult's table maps each criterion to its MSW setup.
- **Agent browser checks** (`verify-ui`, not committed tests):
  - §2.2 with Playwright's `context.setOffline()`;
  - §2.4 with fake credentials, signing in through a `page.route` stub and then letting the real host answer 401.
- **`[User]`:**
  - slice 1: the logged-out probe (risk 1);
  - §2.3 against a real logout, which needs a linkable instance (TKT-5);
  - optionally, a real token rotation (§2.4) and a real Wi-Fi toggle (§2.2).

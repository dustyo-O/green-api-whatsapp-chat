## 1. Logout detection

**What the docs say** (fetched 2026-10-07):
- [StateInstanceChanged](https://green-api.com/en/docs/api/receiving/notifications-format/StateInstanceChanged/): it is enabled by the console option "Receive notifications about the instance authorization state change", or by `SetSettings` → **`stateWebhook`**. `stateInstance` values: `notAuthorized`, `authorized`, `blocked`, `sleepMode`, `starting`, `yellowCard`, `suspended`. The body is `{typeWebhook:"stateInstanceChanged", instanceData, timestamp, stateInstance}`.
- [HTTP API technology](https://green-api.com/en/docs/api/receiving/technology-http-api/): "Only notifications matching your enabled settings enter the queue" (`incomingWebhook` / `outgoingWebhook` / `stateWebhook`). Entries expire after 24 h.
- [SetSettings](https://green-api.com/en/docs/api/account/SetSettings/): "After creating an instance, all settings are turned off by default." [GetSettings](https://green-api.com/en/docs/api/account/GetSettings/) returns `stateWebhook: "yes"|"no"`.
- [Rate limiter](https://green-api.com/en/docs/api/ratelimiter/): `getStateInstance` 1 rps, `receiveNotification`/`deleteNotification` 100 rps, `sendMessage` 50, `checkWhatsapp` 10. Anything above the limit gets **429**.
- [GetStateInstance](https://green-api.com/en/docs/api/account/GetStateInstance/) returns the same seven values. `yellowCard` is deprecated in favour of `suspended`.

**Answer:** the notification is **queued only when `stateWebhook` is `yes`**. The user's instance has it on: the spec 004 slice 1 ledger shows a real `stateInstanceChanged` read from the queue. A reviewer's fresh instance may have it off, and we don't control that. So the notification alone can't promise "within 5 minutes".

**Minimal design: always do both, with no branching on the setting.**
- **Notification (fast path, usually seconds):** a pure `toStateChange(body): string | null` in `src/chat/notification.ts`. It returns `stateInstance` when `typeWebhook === "stateInstanceChanged"` and the value is one of the seven known states, otherwise `null`. The loop sets the state, then deletes the notification as it does now (`toIncoming` already returns `null` for it, so it stays "delete and skip" for chats).
- **Fallback (the bound):** a new `src/chat/state-watch.ts` with `watchInstanceState(credentials, signal)`. It sleeps **4 min**, then calls `getStateInstance` (15 s budget), and repeats. Worst case is 4 min + 15 s, which is under 5 min. Starting the first check at mount + 4 min keeps it clear of sign-in's own `getStateInstance` call (1 rps). It runs from the same `MainScreen` effect as `runReceiveLoop` and stops on the same `AbortController`. That's 1 request per 4 min per tab, far below the limit. Recovery uses the same path, so it also meets "disappears within 5 min".
- Not chosen: reading `stateWebhook` at sign-in and polling only when it is off. It adds a branch and a test matrix for one request every 4 min.

## 2. Response → state mapping

**Classes** (from `GreenApiError.kind`/`status` in `src/api/green-api.ts`):

| Outcome | receive | delete | getStateInstance (watch) | sendMessage / checkWhatsapp |
|---|---|---|---|---|
| 2xx, valid body | **reachable**: clears `noConnection` + `keyInvalid`, resets the network streak; empty → also **works** (clears stuck) | **reachable + works** (incl. `result:false` and the 500 `findUnAckedMessage`, already resolved by the client) | reachable; sets `instanceState` (known value only) | unchanged; feeds no state |
| 401 | **keyInvalid** | keyInvalid | keyInvalid | unchanged (`failed` / `checkFailed`) |
| 403 with CORS | **keyInvalid** (same as spec 002 `wrongCredentials` and architecture §4 "401/403") | keyInvalid | keyInvalid | unchanged |
| `network` (`TypeError`) | **network failure** | network failure | ignored | unchanged (`unknown` / `checkFailed`) |
| `timeout` from the **budget** | **network failure** (a stalled upstream) | network failure | ignored | unchanged |
| `timeout` from **wake/abort** (`online`, logout) | **not a failure**: `continue` without backoff or counting | same | — | — |
| 429 | **stuck clock** + backoff | stuck clock | ignored (next tick) | unchanged |
| 5xx (other than the delete "not found") | stuck clock | stuck clock | ignored | unchanged |
| `badBody` | stuck clock | stuck clock | ignored | unchanged |
| save throws (full localStorage) | stuck clock (no delete, as now) | — | — | — |

- **Only the receive loop, the watch and the browser events write the state.** Sends and checks don't need to. The loop polls every ≤ 5 s, so a rotated key shows within seconds of the next poll. `outcomes.ts` stays as it is.
- **"No connection" = two network failures in a row** (receive or delete), **or** a device `offline` event, **or** `navigator.onLine === false` at loop start. It clears on the next **reachable** answer, not on the `online` event. `online` only wakes the loop, as it does now.
  - The 20 s bound, worst case for a hanging upstream with no `offline` event: poll times out at 8 s (budget), backoff 1 s, second poll times out at 17 s, banner. With a fast `TypeError` (DNS/route gone): about 1 s.
  - The 3 s bound: the `offline` listener sets the flag synchronously.
  - The 10 s recovery: `online` → wake → poll → empty after ≤ 5 s (`receiveTimeout=5`) → reachable → banner gone. Without an `online` event: the backoff cap of 5 s plus the 5 s poll.
- **"Key invalid":** a single 401/403 sets it, with no streak (a valid token never gets a CORS 401). Any later reachable 2xx clears it. The loop keeps polling at the 5 s backoff cap (receive allows 100 rps, harmless).
- **"Receiving stuck":** the loop keeps a local `stuckSince: number | null` (`Date.now()`).
  - The first stuck-clock failure starts it. On each later stuck-clock failure, if `now - stuckSince >= 60_000` → `stuck: true`. Failures repeat every ≤ 5 s, so the banner shows between 60 and 65 s.
  - **Only "works"** resets it: an empty poll, or a successful delete. A notification received but not deleted does **not** reset it (F6).
  - Network and 401 failures neither start nor reset it; the banner priority hides it anyway.
- **Change in `runReceiveLoop`:** today a wake-abort runs `backOff()` and increments `failures`. In the catch, check `wake.signal.aborted` first and `continue`, so an `online` wake is never counted as a network failure. The existing tests "drops a stalled receive…" and "cuts a backoff short…" stay green.

## 3. State model

- **New non-persisted store** `src/chat/status-store.ts` (Zustand, no `persist`; a reload starts clean and the sign-in check re-proves `authorized`):
  ```ts
  interface StatusState {
    keyInvalid: boolean;
    instanceState: string;   // "authorized" initially; any of the 7 GREEN-API values
    noConnection: boolean;
    stuck: boolean;
    set…(…); reset(): void;  // back to all-clear + "authorized"
  }
  type Banner = "key" | "auth" | "offline" | "stuck";
  export function bannerOf(s): Banner | null      // priority key > auth > offline > stuck
  export function pausedBy(s): Exclude<Banner,"stuck"> | null
  ```
  - `auth` = `instanceState !== "authorized"`.
- **Texts:** the auth banner reuses spec 002's wording. Export `stateError` from `src/auth/check-instance.ts`, then `checkErrorMessage(stateError(instanceState), apiUrl)` from `messages.ts` (`suspended`/`yellowCard` → `restricted`). Accept only the seven known values in `toStateChange` and the watch, so `"unknown"` never reaches the banner.
- **Who writes what:**
  - Receive loop: `noConnection` (streak, `offline` event and `navigator.onLine`, cleared on reachable), `keyInvalid` (set/clear), `stuck` (set/clear), `instanceState` (from `toStateChange`).
  - Watch: `instanceState`, `keyInvalid`.
  - The `offline`/`online` listeners live in the loop next to the existing `online` one, removed in its `finally`.
- **Reset:** `reset()` at the start of the `MainScreen` effect (before both loops start) and in its cleanup. Logout unmounts `MainScreen`, so the state resets there; `session-store` stays untouched. The session-change guard in the loop already stops writes after logout. Writes after `stopped()` must be skipped too, so a late answer can't re-raise a banner on the sign-in screen.

## 4. Sending paused

- **The guard lives in the store actions, with UI hints in components:**
  - `useChats.send` and `useChats.retry`: return early when `pausedBy(useStatus.getState()) !== null`, **before** `patchChat`. No bubble is created, the draft isn't cleared, and ❗ stays ❗. This covers Enter and «Повторить» in one place. `chats-store` → `status-store` is a one-way import, so there's no cycle.
  - `NewChatForm.handleSubmit`: `if (checking || !submittable || paused) return;` and `disabled` on «Начать чат» while paused. "Opening an existing chat" is blocked too, which is simplest and harmless.
  - «Повторить»: `disabled={paused}` (UI); the store guard is the real one.
- **Composer:** `placeholder={PLACEHOLDERS[paused] ?? "Введите сообщение"}`, with:
  - `offline` → «Нет соединения — сообщение можно будет отправить позже»
  - `auth` → «Инстанс не авторизован — отправка недоступна»
  - `key` → «Ключ доступа не действует — отправка недоступна»
  - The textarea stays enabled, so the draft is kept and editable. Enter calls `send`, which returns without doing anything.
- **In-flight sends:** the guard is entry-only. `settle()` is unchanged, so a send already on its way finishes with GREEN-API's answer.
- `stuck` is not in `pausedBy`.

## 5. UI

- **`src/chat/Banner.tsx` + `Banner.module.css`:** reads `bannerOf(useStatus)`, renders nothing when it is `null`, otherwise `<div role="status" className={styles[variant]}>text {key && <button onClick={signOut}>Выйти</button>}</div>`. `signOut` comes from `useSession` (wipe + empty form, as today).
- **Variants:**
  - `key`, `auth` → **red**
  - `offline` → **neutral**: WhatsApp Web's yellow "not connected" strip
  - `stuck` → **grey**
- **Placement in `MainScreen.tsx`:** wrap the right-hand side in `<div className={styles.main}>` (flex column, `min-height: 0`): `<Banner/>`, then the intro or `<Conversation/>` with `flex: 1`. This covers "above «Выберите чат…»" and "above the open chat". The grid stays 2 columns.
- **Tokens in `src/index.css`** (light / dark):
  - `--color-banner-danger` `#fde8ea` / `#3b2027`, text `--color-danger`
  - `--color-banner-warning` `#fff3c4` / `#3d3520`, text `--color-text`
  - `--color-banner-muted` `#e9edef` / `#2a3942`, text `--color-text-muted`

  The red text reuses the existing `--color-danger`.

## 6. Tests (Vitest + RTL + MSW)

**Unit:**
- `status-store.test.ts`: `bannerOf` priority table (all 16 flag combinations is cheap) and `pausedBy`.
- `notification.test.ts`: `toStateChange` cases (each known state, unknown value, the real slice-1 body).
- `receive-loop.test.ts`: the classification table above, one case per row. Fake timers `toFake: ["setTimeout","clearTimeout","Date"]`. "wake-abort is not a failure."
- `state-watch.test.ts`: `getStateInstance` at 4 min, not before; 401 → `keyInvalid`; `TypeError` ignored; aborted stops.

**Integration, one per criterion,** in `src/chat/connection.test.tsx`. Reuse the `receiving.test.tsx` `loadPage` pattern with **unmount on reload** (spec 004 ledger). MSW: `server.use(http.get("*/receiveNotification/*", () => failure(500) | HttpResponse.error()))`, `queue({receiptId, body:{typeWebhook:"stateInstanceChanged",…}})`, `status("getStateInstance", …)`, `stateIs(…)`.

| § | Criterion | Test |
|---|---|---|
| 2.1 c1 | offline + not authorized → auth banner only; authorized → «Нет соединения…» | `offline` event + queued `notAuthorized` → only the auth text; queue `authorized` (stay offline: `navigator.onLine` spy false, receive `TypeError` after it) → offline text |
| 2.1 c2 | above the intro | banner present with no chat selected, before «Выберите чат…» in DOM order |
| 2.2 c1 | device offline → ≤ 3 s | dispatch `offline`, advance 3 s → text |
| 2.2 c2 | online, unreachable → ≤ 20 s | receive hangs (`delay("infinite")`), advance 20 s → text; at 16 s → absent |
| 2.2 c3 | back online → gone ≤ 10 s, replies appear | offline banner, restore the default queue + queue a reply, dispatch `online`, advance 10 s → no banner, bubble present |
| 2.3 c1 | logged-out notification → red banner, chats kept | queue `notAuthorized` → text; chat list + messages unchanged |
| 2.3 c2 | authorized again → gone | then queue `authorized` → no banner |
| 2.3 c3 | blocked → text + paused | queue `blocked` → «Инстанс заблокирован…»; Enter → no POST in `posted` |
| 2.3 c4 | nothing else, 5 min → red | `stateIs("notAuthorized")` after mount, empty queue, advance 5 min → text (RED: remove the watch) |
| 2.4 c1 | key banner + «Выйти» → empty form | receive → `failure(401)` → text + button; click → empty sign-in form |
| 2.5 c1 | errors > 1 min → grey; normal → gone | receive `failure(500)`, advance 65 s → grey; restore → gone |
| 2.5 c2 | delete failing > 1 min → grey | queue a reply, delete → `failure(503)`, advance 65 s → grey (and the reply shows once) |
| 2.5 c3 | < 1 min → none | 500s for 50 s → no grey |
| 2.6 c1 | offline, Enter keeps «Привет», placeholder | type, `offline`, Enter → no `sendMessage`, value kept, `placeholder` attribute |
| 2.6 c2 | auth, Enter → no bubble | — |
| 2.6 c3 | banner gone → Enter sends | after recovery Enter → `sentAs` → ✅ |
| 2.6 c4 | offline, «Начать чат» → no chat | no `checkWhatsapp` request, chat list unchanged |
| 2.6 c5 | ❗ + auth → «Повторить» does nothing | button disabled; `retry` via the store also no-ops, still ❗ |
| 2.6 c6 | only grey → Enter sends | stuck banner + Enter → POST + ✅ |

- **Fake timers + MSW:** follow the existing `receiving.test.tsx` setup (`vi.useFakeTimers({ toFake: [...] })` + `userEvent.setup({ advanceTimers: vi.advanceTimersByTime })` + `advanceTimersByTimeAsync`). Add `"Date"` for the stuck minute.
- **`[User]` / device:**
  - §2.3 c1 and c4 against a **real** logout need a linkable instance (TKT-5): the user's instance is logged out and sign-in refuses it.
  - §2.4 does **not** need the user. Wrong token on the right host = real CORS 401 (verified in spec 002). An agent can check it with **fake** credentials in `verify-ui` (sign in through a `page.route` stub, then let the real host answer 401). A real rotation by the user is optional.
  - §2.2 c1/c3 can be agent-checked with Playwright `context.setOffline()` in `verify-ui` (fires `offline`/`online`); a real Wi-Fi toggle is an optional "Verify — device".

## 7. Risks (riskiest first)

1. **What GREEN-API returns on `receiveNotification`/`deleteNotification` while the instance is `notAuthorized`.** If it is a CORS 4xx instead of 200, our mapping shows the **key** banner instead of the auth one.
   - Evidence for 200: the user's slice-1 `curl` got 200 on 2026-10-06, after WhatsApp logged the instance out (spec 003 parked note). It's not certain the curl ran while logged out.
   - Mitigation: **slice 1** = the store, mapping and banner, plus a `[User]` token-safe `curl` of `receiveNotification?receiveTimeout=5` **and** `getStateInstance` on the still-logged-out instance (status + body shape only).
2. **`stateWebhook` off on a reviewer's instance.** The fallback watch covers it (≤ 4 min 15 s), so this is mitigated by design. The README can say "turn on authorization-state notifications for an instant banner" (Phase 3).
3. **A stale `stateInstanceChanged` backlog (24 h) after sign-in** (e.g. an old `notAuthorized` followed by `authorized`) flickers the red banner while the queue drains. If the matching `authorized` was never queued, the banner is wrong until the next watch tick (≤ 4 min). Accepted; no timestamp comparison (clock skew, more code).
4. **A CORS 403 meaning something else** (e.g. an expired/unpaid instance) shows "key invalid" + «Выйти». Same mapping as sign-in, so the behaviour is consistent; accepted.
5. **The wake-abort counted as a network failure** would flash «Нет соединения» on every `online`. Covered by the loop change in §2 and a unit test.
6. **Fake-timer flakiness** (`Date` faked with MSW). Keep `toFake` explicit; reuse the spec 004 pattern; unmount old roots.
7. **Multiple tabs:** each tab runs a watch, and two tabs can hit the 1 rps limit (429 → ignored, next tick in 4 min). One active tab (its own spec) removes this.

## Open questions for the lead

- Ask the user for the risk 1 probe (logged-out instance: `receiveNotification` and `getStateInstance` status + shape)? It decides whether a 4xx on receive while logged out needs its own row (→ `auth`, not `key`).
- 403: keep it as "key invalid" (consistent with sign-in), or treat it as "stuck"? I recommend "key invalid".

---
_consult: react-frontend · perms: auto · model: default · 2026-10-07T14:57:47+02:00_

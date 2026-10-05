# react-frontend consult — spec 002 Sign-In & Session (tech)

Sources read: `context/spec/002-sign-in-session/functional-spec.md`, `reviews/TRIAGE.md`, `context/product/architecture.md`, `src/**`, `vite.config.ts`, `package.json`, `tsconfig.app.json`, `eslint.config.js`, `e2e/published-build.test.ts`, `e2e/support.ts`. Facts below marked _verified_ were checked in this session (commands cited); everything else is a recommendation.

## 1. File layout

New (all under `src/`):
- `api/green-api.ts` — `Credentials` type, URL builder, `getStateInstance`, `getSettings`, `GreenApiError` (transport/HTTP failure kinds). No mapping to UI text here.
- `auth/check-instance.ts` — `checkInstance(creds, { timeoutMs = 15_000 }): Promise<CheckError | null>`: the call order, the 15 s budget, and the **one** outcome → `CheckError` mapping (§2).
- `auth/messages.ts` — `checkErrorMessage(error, apiUrl): string`: the §2.2 Russian table, verbatim, one entry per `CheckError`.
- `auth/credentials.ts` — `deriveApiUrl(id)`, `normalize(form) → Credentials` (trim, strip trailing `/`), `fieldHints(form)` / `canSubmit(form)` (pure).
- `auth/session-store.ts` — Zustand store + `persist` (§3), actions `resume`, `signIn`, `signOut`.
- `auth/LoginScreen.tsx` + `LoginScreen.module.css` — the form, the error + «Проверить снова», the version footer.
- `chat/MainScreen.tsx` + `MainScreen.module.css` — empty two-column shell (§2.3).
- `test/green-api-server.ts` — MSW `setupServer` + small handler factories (test-only, never imported by app code).

Changed:
- `App.tsx` — switch on `screen`: `checking` → inline «Проверяем инстанс…»; `signedOut` → `LoginScreen`; `signedIn` → `MainScreen`. Keeps its `build: BuildInfo` prop and passes it to `LoginScreen`.
- `App.module.css` — only the checking-screen + centered-page styles survive; `.title/.note/.version` move to the login CSS.
- `main.tsx` — calls `useSession.getState().resume()` **once, before `render`** (not in an effect; see §4).
- `index.css` — palette tokens extended (§6).
- `package.json` — deps (§7).

Spec 001 label: the `<h1>GREEN-API WhatsApp Chat</h1>` heading and the existing `Version <time dateTime=…>{formatVersion(build)}</time>` markup move into the login screen (heading on top, version in the footer). `build-info.ts` unchanged.

Spec 001 tests that **will go red** and must be edited in the same slice (gate = `npm run check`, which runs `e2e/` too — _verified_ `npx vitest list --filesOnly` lists `e2e/*.test.ts`):
- `src/App.test.tsx:20-21` and `src/main.test.tsx:42` assert `/early skeleton/`, `/chat is not available yet/`.
- `e2e/published-build.test.ts:134` asserts `"early skeleton"` is in the bundle.
- Everything else in those tests (heading, version label, `<time>`, "local differs only by the label") keeps passing if the signed-out login screen renders the heading + footer and the store starts `signedOut` with no saved credentials.

## 2. GREEN-API client + outcome mapping

- URL: `${apiUrl}/waInstance${idInstance}/${method}/${apiTokenInstance}`, `apiUrl` already normalized (trimmed, trailing `/` stripped). GET, no headers, no body → no CORS preflight.
- `request(creds, method, signal): Promise<unknown>`:
  - `fetch` throws → if `signal.aborted` → `GreenApiError('timeout')`; else if `TypeError` → `'network'`; else rethrow as `'unknown'`.
  - `!res.ok` → `GreenApiError('http', res.status)`. **Never call `res.json()` on a non-2xx**: GREEN-API's 401/429 carry `Content-Type: application/json` with `Content-Length: 0` (_verified_, §8) → `json()` would throw `SyntaxError`.
  - 2xx → `await res.json()` typed as `unknown` (strictTypeChecked forbids `any` flowing out); `SyntaxError` → `'badBody'`.
- `getStateInstance` / `getSettings` narrow the `unknown` with tiny type guards and return `{ stateInstance: string }` / `{ webhookUrl: string; incomingWebhook: string }`; a body that fails the guard → `'badBody'`.
- Token never logged; error objects carry kind/status only, never the URL.
- Timeout: **one budget for the whole check** (spec: "no answer within 15 s after «Войти»"): `checkInstance` creates one `AbortController` + `setTimeout(() => controller.abort(), timeoutMs)`, passes `controller.signal` to both calls (body reading honours it), `clearTimeout` in `finally`. Chosen over `AbortSignal.timeout()` because Vitest fake timers drive `setTimeout` (_verified_ in scratch: MSW 3 + jsdom 30 + `vi.useFakeTimers({ shouldAdvanceTime: true })` + `advanceTimersByTimeAsync(15000)` aborts the pending fetch; `AbortSignal.timeout(50)` also works with real timers, rejection `name === "TimeoutError"`).
- Order: `getStateInstance` first; `getSettings` **only if** `stateInstance === "authorized"` (sequential; saves a call and the per-method rate limit, ~2 × RTT is well within 5 s).

`type CheckError = 'wrongCredentials' | 'unreachable' | 'notAuthorized' | 'sleepMode' | 'starting' | 'blocked' | 'restricted' | 'webhookSet' | 'incomingOff' | 'unknown'`

| Outcome (either call) | `CheckError` | Message key in §2.2 |
|---|---|---|
| HTTP 401 or 403 (with CORS headers, i.e. a real GREEN-API answer) | `wrongCredentials` | «Неверный idInstance или apiTokenInstance.» |
| `fetch` `TypeError` (offline, DNS failure, host/instance mismatch → CORS-less nginx 403) | `unreachable` | «Не удалось связаться с {apiUrl}. …» |
| aborted by the 15 s timer | `unknown` | «Не удалось проверить инстанс. …» |
| 429, 5xx, any other non-2xx | `unknown` | same |
| 2xx with non-JSON body or wrong shape | `unknown` | same |
| any other thrown error | `unknown` | same |
| `stateInstance: "authorized"` | → run `getSettings` | — |
| `"notAuthorized"` | `notAuthorized` | «Инстанс не авторизован. …» |
| `"sleepMode"` | `sleepMode` | «Телефон с WhatsApp не в сети. …» |
| `"starting"` | `starting` | «Инстанс запускается. …» |
| `"blocked"` | `blocked` | «Инстанс заблокирован. …» |
| `"suspended"` or `"yellowCard"` | `restricted` | «Работа инстанса временно ограничена. …» |
| any other `stateInstance` string | `unknown` | catch-all |
| settings: `webhookUrl.trim() !== ""` (checked first, table order) | `webhookSet` | «Входящие сообщения уходят на webhook. …» |
| settings: `incomingWebhook !== "yes"` | `incomingOff` | «Уведомления о входящих сообщениях выключены. …» |
| settings fine | `null` → signed in | — |

State values _verified_ against https://green-api.com/en/docs/api/account/GetStateInstance/ (`curl … | sed 's/<[^>]*>//g' | grep`): `notAuthorized`, `authorized`, `blocked`, `sleepMode` ("out of date"), `starting`, `yellowCard` ("deprecated"), `suspended` ("temporary restrictions"). Note: architecture §4 lists `suspended` but not `yellowCard`; map both. Settings fields _verified_ on the GetSettings page: `webhookUrl` (string), `incomingWebhook` (`yes`/`no`).

## 3. Session state (Zustand)

```ts
interface Credentials { idInstance: string; apiTokenInstance: string; apiUrl: string; customApiUrl: boolean }
interface SessionState {
  credentials: Credentials | null;            // persisted: last credentials that passed the check
  screen: 'checking' | 'signedOut' | 'signedIn';
  error: CheckError | null;                    // shown on the login form
  busy: boolean;                               // form submit in flight
  resume(): Promise<void>;  signIn(c: Credentials): Promise<void>;  signOut(): void;
}
```
- `persist` options: `name: "green-api-chat:session"`, `version: 1`, default `createJSONStorage(() => localStorage)`, `partialize: s => ({ credentials: s.credentials })` — only the 3 values + the custom-URL flag are written.
- Unreadable data (§2.4) → empty form, via a `merge(persisted, current)` that accepts `persisted.credentials` only if it passes an `isCredentials` guard, else returns `current`. _Verified_ in scratch (zustand 5.0.15, jsdom): corrupt JSON → `onRehydrateStorage` gets a `SyntaxError`, state stays initial (`credentials: null`), no throw; `credentials: 42` → `null` via `merge`; saved `version: 0` without `migrate` → dropped (zustand logs a `console.error`); `getItem` throwing → `null`; the next `set` overwrites the corrupt value normally.
- Credentials are saved only on a successful check (`signIn` success). A failed **reload** keeps them (so the form is prefilled and another reload re-checks); a failed **form submit** doesn't touch them.
- `signOut()` → `set({ credentials: null, screen: 'signedOut', error: null })`. Storage then holds `{"state":{"credentials":null},"version":1}` (_verified_) — no token left. `persist.clearStorage()` is unnecessary.
- Not needed now: per-`idInstance` keying (that's for chats, later), cross-tab sync (out of scope).

## 4. Screens and reload

- `screen` lives in the store (above); `App` selects it. Initial `screen: 'signedOut'`.
- `resume()`: no `credentials` → stays `signedOut`. Else `set({ screen: 'checking' })` synchronously, `await checkInstance`, then `signedIn` or `{ screen: 'signedOut', error }`.
- `main.tsx` calls `resume()` once before `createRoot().render()`. Persist hydrates synchronously from `localStorage`, so `credentials` are there. Because the `set` is synchronous, the first paint is already «Проверяем инстанс…».
- **Why not `useEffect`:** `StrictMode` mounts effects twice in dev. That means two parallel `getStateInstance` calls, and GREEN-API answers parallel calls with **429** (_verified_, §8). The dev check would then randomly show the catch-all message.
- `signIn(c)`: `set({ busy: true, error: null })` → check → success `{ credentials: c, screen: 'signedIn', busy: false }`, failure `{ error, busy: false }`. The form keeps its own field state, so the user's input survives.

## 5. Form

- Local `useState` form `{ idInstance, apiTokenInstance, customApiUrl, apiUrl }`, initialised once from `credentials ?? empty`. The component remounts on each screen switch, so it is empty after logout and prefilled after a failed reload.
- Derivation: `deriveApiUrl(id) = /^\d{4}/.test(id.trim()) ? \`https://${id.trim().slice(0,4)}.api.greenapi.com\` : ""`. The shown value is `customApiUrl ? form.apiUrl : deriveApiUrl(form.idInstance)`.
- Ticking the checkbox seeds `form.apiUrl` with the current derived value. Unticking needs no code, because the shown value goes back to the derived one.
- Use `readOnly` for the derived field, not `disabled`: it stays readable and copyable. Tests assert the `readonly` attribute.
- Trimming: `normalize()` trims all three values and strips trailing `/` from the URL (`replace(/\/+$/, "")`). Validation and the check both run on normalized values.
- Validation (pure):
  - id `/^\d+$/`
  - token non-empty
  - URL: `try { const u = new URL(v); ok = u.protocol === "https:" && u.hostname !== "" } catch { ok = false }`. `"https://"` throws, so it is invalid. No path or query rules (TRIAGE F4).
  - Use `try/catch` over `URL.canParse` so there's no compat question.
- Hints: show one under a field only when its trimmed value is **non-empty and invalid**. Empty fields just keep «Войти» disabled. This covers all §2.1 criteria (see open question 1).
- Proposed hint texts (the spec gives none):
  - «Только цифры, например 7103123456.»
  - «Полный адрес, начинающийся с https://»
- Token field: `type={show ? "text" : "password"}`, `autoComplete="off"`. Next to it a `<button type="button" aria-pressed={show}>` labelled «Показать» / «Скрыть». No icon library.
- Busy state:
  - Wrap the inputs in `<fieldset disabled={busy}>` (one attribute).
  - Submit button: `disabled={!canSubmit || busy}`, text «Проверяем…» while busy, `aria-busy`.
  - The handler also returns early `if (busy)`, which stops a double submit.
- «Проверить снова» appears with the error. It is a second `type="submit"` button: same handler, current values. «Войти» stays.
- The error is shown in a `role="alert"` block, text from `checkErrorMessage(error, normalizedApiUrl)`.

## 6. UI and styling

- Palette tokens in `index.css` `:root`. Keep the existing 4; add these. Values are WhatsApp Web approximations, and the dark set goes under the existing media query.

  | Token | Light | Dark |
  |---|---|---|
  | `--color-panel` | `#ffffff` | `#111b21` |
  | `--color-panel-header` | `#f0f2f5` | `#202c33` |
  | `--color-border` | `#d1d7db` | `#2a3942` |
  | `--color-intro-bg` | `#f0f2f5` | `#222e35` |
  | `--color-button` | `#00a884` | `#00a884` |
  | `--color-button-text` | `#ffffff` | `#111b21` |
  | `--color-danger` | `#ea0038` | `#f15c6d` |

- Login (`LoginScreen.module.css`):
  - a centred card (`max-width: 420px`, `--color-panel`, 8px radius, light shadow) on `--color-bg`
  - stacked label + input + hint
  - full-width green «Войти»; the error block in `--color-danger`
  - version footer below the card (existing `.version` style)
- Main (`MainScreen.module.css`):
  - layout: `display: grid; grid-template-columns: minmax(280px, 30%) 1fr; height: 100vh`
  - left `<aside>`: a 60px header bar (`--color-panel-header`) with «Инстанс {id}» and a text button «Выйти», over an empty `--color-panel` body with a right border
  - right `<section>`: `--color-intro-bg`, «Выберите чат, чтобы начать переписку» centred and muted
- Optional, recommend leaving out: a mobile single-column layout, icons/avatars, the green top band of WhatsApp's landing page.

## 7. Tests

New devDependencies (_verified_ with `npm view`, then a scratch install that ran Vitest 5.0.3 + jsdom 30.1.2):
- `msw@^3.0.2`: works. It needs Node ≥ 22.12, and the project is on 22.22.2+. Its peers `vite >=6`, `typescript >=5.9.x` and `graphql` are all optional and satisfied (vite 8.3.2, TS 6.0.3). The exports `http`, `HttpResponse`, `delay`, and `setupServer` from `msw/node` are unchanged from v2. 3.0.0 is a week old (2026-09-28); fallback `^2.15.0` has the same API.
- `@testing-library/user-event@^14.6.7` (peer `@testing-library/dom >=7.21.4`, we have 10.4.2): optional, recommended for realistic typing and clicks. `fireEvent` from RTL would also do.
- `@testing-library/jest-dom`: **leave out**. The existing tests use plain `expect`, and `.disabled` / `.value` / `getAttribute` are enough.
- Runtime dependency `zustand@^5.0.15`: its peers (`react`, `immer`, …) are all optional. No conflicts found.

MSW setup:
- **Per test file** (`server.listen({ onUnhandledRequest: 'error' })` / `resetHandlers` / `close`), **not** in the global `src/test-setup.ts`.
- Reason: `setupFiles` also runs for `e2e/*.test.ts`, and `published-build.test.ts` really fetches a local preview server.
- Add `localStorage.clear()` and `useSession.setState(initialState)` to `afterEach` (store singleton).

Handlers (`src/test/green-api-server.ts`):
- `stateIs(value | {status})` and `settingsAre({ webhookUrl, incomingWebhook } | {status})` on `https://7103.api.greenapi.com/waInstance:id/{getStateInstance|getSettings}/:token`
- `unreachable()` → `HttpResponse.error()`, which rejects with `TypeError` (_verified_)
- `hang()` → `await delay('infinite')`
- a call counter for the "getSettings skipped" and "no double submit" checks

Unit (`auth/credentials.test.ts`):
- `deriveApiUrl`: `7103123456`, `710`, `71a3…`, spaces
- `normalize`: trim, trailing `/`
- validation: `https://`, `http://x`, `https://x/`, letters in the id
- `messages.ts`: the unreachable text names the API URL

Client mapping (`auth/check-instance.test.ts`, MSW, table-driven):
- 401, 403, `TypeError`, timeout (`timeoutMs: 50`, or fake timers at 15 000), 429, 500
- 200 with `text/plain`, 200 with `{}`
- each `stateInstance` value, an unknown value
- settings: webhook set, `incomingWebhook: "no"`, malformed, 401 on `getSettings`
- `getSettings` not called when `notAuthorized`

RTL + MSW (`auth/sign-in.test.tsx`, plus the updated `App.test.tsx`):
- §2.1: c1–c5
- §2.2:
  - c2: 401 → message, fields keep their values
  - c3: `TypeError` → message naming the URL
  - c4: notAuthorized, then swap the handler, then «Проверить снова» → main screen
  - c5: webhook, and notifications off
  - c6: hang + fake timers → catch-all, input kept, «Проверить снова» present
  - c7: busy text, disabled, exactly 1 request
- §2.3 c1
- §2.4:
  - c1/c2: seed `localStorage`, `resume()`, render; the «Проверяем инстанс…» screen, then main or the prefilled form
  - unreadable JSON → empty form
- §2.5 c1: «Выйти» → empty fields, `localStorage` has no token, `resume()` stays `signedOut`

Stays manual:
- An agent can check this in Chrome with **fake** credentials, no user needed: §2.2 c2 (wrong token → real 401) and c3 (mismatched host → real `TypeError`).
- **[User]** with a real instance:
  - §2.2 c1 (≤ 5 s)
  - c4 (authorize in the console, then «Проверить снова»)
  - c5 (webhook / notifications toggled in the console)
  - §2.4 c1 on the live site, and c2 (instance logged out in the console)
  - confirming that the derived `https://{4 digits}.api.greenapi.com` matches the console's API URL

## 8. Real-world probe (no real credentials)

Commands: `curl -sS -i -H "Origin: https://dustyo-o.github.io" https://7103.api.greenapi.com/waInstance7103000000/{getStateInstance,getSettings}/badtoken`, plus the variants below (2026-10-05 ~18:55 UTC).

- Matching host, wrong token (both methods, and `waInstance7103123456`): **`401 Unauthorized`**.
  - Headers: `Content-Type: application/json`, `Content-Length: 0` (empty body), `Access-Control-Allow-Origin: *`, `Access-Control-Expose-Headers: *`, `X-RateLimit-Remaining: 0`, `X-RateLimit-Replenish-Rate: 1`.
  - So **wrong credentials are distinguishable in the browser**: CORS is present, so `res.status === 401` is readable.
- Rapid repeats (4 sequential, then 3 parallel): **`429 Too Many Requests`**, `Content-Length: 0`, `Access-Control-Allow-Origin: *` present, no `Retry-After`.
  - Pattern seen: `401 429 429 401`. That is ~1 request/s per method for an unauthorized token; the limit with a valid token is not measured.
  - `getStateInstance` then `getSettings` back to back both got 401, so the limiter is per method.
- Mismatched host/id (`7103.api…/waInstance1101000000/…`) and malformed id (`waInstance7103`): **`403 Forbidden`, `Content-Type: text/html`, no `Access-Control-Allow-Origin`**. In the browser this is a `TypeError` → `unreachable`. This confirms architecture §4.
- `OPTIONS` preflight: 200, `Allow-Methods: GET, POST, OPTIONS, DELETE, HEAD`. It isn't needed for our plain GETs.
- Side note: the generic `https://api.green-api.com/waInstance7103000000/…` also answers 401 with CORS. It's irrelevant (we only use the derived or custom URL).

## 9. Risks (riskiest first)

1. **Real-instance happy path is unproven.**
   - Unknowns: whether the derived URL matches the console; the real `getSettings` shapes (e.g. could `webhookUrl` be `null` instead of `""`? Treat `null`/missing as empty → if the guard is strict it would land in `unknown`); the 5 s budget.
   - Mitigation: slice 1 = client + `checkInstance` + a bare form, then a **[User]** run against the author's instance before the UI polish.
   - Make the settings guard lenient: `webhookUrl` = `string | null | undefined`, empty when falsy after trim.
2. **429 rate limit.**
   - It hits StrictMode double effects and fast «Проверить снова» clicks.
   - Mitigation: `resume()` outside effects, the busy lock, 429 → catch-all («Попробуйте ещё раз» is the right advice). No auto-retry (out of scope).
3. **Spec 001 regression tests break the gate.** These are the skeleton-note assertions (§1).
   - Mitigation: update them in the same slice, and have the lead record in spec 001 that the placeholder page was superseded by spec 002 (open question 2).
4. **Empty-body JSON 401/429.** `res.json()` on them throws `SyntaxError`, which would show the catch-all instead of the credentials message.
   - Mitigation: check status before parsing, plus a unit test with an empty 401.
5. **MSW in the global setup would intercept the e2e tests' real local fetches.**
   - Mitigation: per-file `server.listen`.
6. **msw 3 is new.** It is verified working here; fallback `^2.15.0` has the same API.
7. **Token exposure.** The token is in the URL path (required by GREEN-API) and in `localStorage` (accepted risk).
   - Mitigation: never log it, keep it out of error objects, and the unreachable message shows only `apiUrl`.

## Open questions for the lead

1. Hints: should they show only for **non-empty** invalid values (recommended; empty fields just keep «Войти» disabled), or also for empty fields after blur? The spec says "under any field that doesn't meet this". The token field would only ever get a hint in the second variant.
2. The spec 001 skeleton-note assertions (`src/App.test.tsx:20-21`, `src/main.test.tsx:42`, `e2e/published-build.test.ts:134`) have to be retired or rewritten to the login heading. OK to do that in slice 1, with a Change Log line in spec 001?
3. Hint wording is not in the spec. Accept the proposed «Только цифры, например 7103123456.» / «Полный адрес, начинающийся с https://», or does the user want to choose?

---
_consult: react-frontend · perms: auto · model: default · 2026-10-05T20:54:11+02:00_

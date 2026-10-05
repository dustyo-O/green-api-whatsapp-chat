<!--
This document describes HOW to build the feature at an architectural level.
It is NOT a copy-paste implementation guide.
-->

# Technical Specification: Sign-In & Session

- **Functional Specification:** [functional-spec.md](functional-spec.md)
- **Status:** Draft
- **Author(s):** Alexander Shleyko (lead) · `react-frontend` consult: [consults/](consults/) (`react-frontend-tech-sign-in-*.md`; versions and GREEN-API behaviour verified 2026-10-05)

---

## 1. High-Level Technical Approach

A small typed GREEN-API client makes two read-only GET calls: `getStateInstance`, then `getSettings` only if the instance is authorized. One `checkInstance()` turns every outcome into one of 10 error keys, under a single 15 s budget. A Zustand store with `persist` holds the credentials (localStorage) and the current screen (`checking | signedOut | signedIn`). React renders one of three screens: «Проверяем инстанс…», the login form, or the empty WhatsApp-style main screen. Everything is tested against MSW; one real-instance check is a `[User]` step. Minimal by design (user rule: avoid overengineering).

---

## 2. Proposed Solution & Implementation Plan (The "How")

### 2.1. Files

| path | responsibility |
|---|---|
| `src/api/green-api.ts` | `Credentials` type, URL `${apiUrl}/waInstance${id}/${method}/${token}`, `getStateInstance`, `getSettings` (lenient type guards), `GreenApiError` kinds `network` / `timeout` / `http(status)` / `badBody` |
| `src/auth/check-instance.ts` | `checkInstance(creds, { timeoutMs = 15000 }) → CheckError \| null`: call order, one `AbortController` + `setTimeout` for both calls, the outcome mapping (§2.2) |
| `src/auth/messages.ts` | `CheckError` → the Russian texts of functional §2.2, verbatim; the unreachable text names the API URL |
| `src/auth/credentials.ts` | pure: `deriveApiUrl`, `normalize` (trim, strip trailing `/`), field validation, `canSubmit` |
| `src/auth/session-store.ts` | Zustand + `persist` store (§2.3) with `resume`, `signIn`, `signOut` |
| `src/auth/LoginScreen.tsx` + `.module.css` | form, error block (`role="alert"`) + «Проверить снова», spec 001 heading and version footer |
| `src/chat/MainScreen.tsx` + `.module.css` | empty two-column shell (functional §2.3) |
| `src/App.tsx` (+ css) | switches on `screen`; keeps the `build` prop and passes it to `LoginScreen` |
| `src/main.tsx` | calls `useSession.getState().resume()` **once before render** (not in an effect: StrictMode would fire two parallel checks → GREEN-API 429) |
| `src/index.css` | WhatsApp-like palette tokens (light + dark) |
| `src/test/green-api-server.ts` | test-only MSW `setupServer` + handler factories (`stateIs`, `settingsAre`, `unreachable` = `HttpResponse.error()`, `hang`, call counter) |

### 2.2. Outcome → message mapping

`CheckError = wrongCredentials | unreachable | notAuthorized | sleepMode | starting | blocked | restricted | webhookSet | incomingOff | unknown`

| Outcome (either call) | Error |
|---|---|
| HTTP 401 or 403 with CORS (a real GREEN-API answer) | `wrongCredentials` |
| `fetch` `TypeError` (offline, DNS, host/instance mismatch → CORS-less nginx 403) | `unreachable` |
| 15 s budget aborted; 429; 5xx; other non-2xx; non-JSON or wrong-shape 2xx; anything thrown | `unknown` |
| `stateInstance`: `notAuthorized` / `sleepMode` / `starting` / `blocked` | the matching key |
| `stateInstance`: `suspended` or `yellowCard` | `restricted` |
| `stateInstance`: any other value | `unknown` |
| `authorized`, then settings `webhookUrl` missing or not a string, or `incomingWebhook` missing | `unknown` (review 3 F2) |
| settings `webhookUrl` non-empty after trim | `webhookSet` |
| settings `incomingWebhook !== "yes"` | `incomingOff` |
| settings fine | `null` → signed in |

- **Never parse JSON on a non-2xx.** GREEN-API's 401/429 have `Content-Type: application/json` with an **empty body** (verified), so check the status first.
- The token is never logged or put into error objects. Messages show only the API URL.

### 2.3. Session store

- State:
  - `credentials: {idInstance, apiTokenInstance, apiUrl, customApiUrl} | null`
  - `screen: 'checking' | 'signedOut' | 'signedIn'`
  - `error: CheckError | null`
  - `busy: boolean`
- `persist`: `name: "green-api-chat:session"`, `version: 1`, `partialize` keeps only `credentials`, and a `merge` with an `isCredentials` guard. Corrupt JSON, the wrong shape or an old version all fall back to `credentials: null`, i.e. the empty form (functional §2.4; verified with zustand 5.0.15).
- `resume()`: with no credentials it stays `signedOut`. Otherwise it sets `checking` synchronously, so the first paint is «Проверяем инстанс…», then `signedIn` or `{signedOut, error}`. Saved credentials are kept on failure, so the form comes back prefilled.
- `signIn(c)`: `busy` → check → on success, save the credentials and `signedIn`. On failure, set `error` and leave the saved credentials untouched.
- `signOut()`: sets `credentials: null`, `screen: signedOut`, `error: null`. Storage keeps no token.

### 2.4. Form

- Local `useState`, initialised from `credentials ?? empty`. The screen remounts on switch, so the form is empty after logout and prefilled after a failed reload.
- `deriveApiUrl(id)`: if the trimmed id starts with 4 digits → `https://{4 digits}.api.greenapi.com`, else `""`. The shown value is the custom value when the checkbox is ticked, otherwise the derived one. Ticking seeds the custom value with the derived one. The field is `readOnly` (not `disabled`) when derived.
- Validation runs on normalized values:
  - id `^\d+$`
  - token not empty
  - URL parses with `new URL()`, `protocol === "https:"`, non-empty host, `pathname === "/"`, and empty `search`, `hash`, `username` and `password`. So it's scheme + host (+ port) only, and `https://`, `https://x/#y`, `https://x?y` and `https://x/base` are all invalid (review 3 F1). Base paths aren't supported.
- **Hints show only for non-empty invalid values** (empty fields just keep «Войти» disabled). **Assumption** (consult open question 1, recommended).
- **Hint texts. Assumption** (open question 3, recommended; added to functional §2.1):
  - «Только цифры, например 7103123456.»
  - «Полный адрес, начинающийся с https://»
- Token field: `type` switches between `password` and `text`; a «Показать» / «Скрыть» button with `aria-pressed`; `autoComplete="off"`.
- Busy:
  - `<fieldset disabled>`
  - the submit button disabled, showing «Проверяем…» with `aria-busy`
  - the handler returns early if busy, so there's exactly one request per click
- «Проверить снова» is a second submit button that appears with the error.

### 2.5. UI

- **Palette tokens in `index.css`, light / dark:**

  | Token | Light | Dark |
  |---|---|---|
  | `--color-panel` | `#ffffff` | `#111b21` |
  | `--color-panel-header` | `#f0f2f5` | `#202c33` |
  | `--color-border` | `#d1d7db` | `#2a3942` |
  | `--color-intro-bg` | `#f0f2f5` | `#222e35` |
  | `--color-button` | `#00a884` | `#00a884` |
  | `--color-button-text` | `#ffffff` | `#111b21` |
  | `--color-danger` | `#ea0038` | `#f15c6d` |

- **Login:** a centred card (max 420px). Labelled inputs with hints, a full-width green «Войти», the error block in `--color-danger`, and the spec 001 version label in the footer.
- **Main:** grid `minmax(280px, 30%) 1fr`, full height.
  - Left: a 60px header with «Инстанс {id}» and a text button «Выйти», over an empty panel.
  - Right: «Выберите чат, чтобы начать переписку», centred and muted.
- Left out on purpose: a mobile layout, icons, avatars, the green landing band.

### 2.6. Dependencies

Versions checked with `npm view` and installed in a scratch copy:
- **Runtime:** `zustand@^5.0.15`. It's already in architecture.md.
- **Dev:** `msw@^3.0.2` (MSW is in architecture.md; fallback `^2.15.0` has the same API) and `@testing-library/user-event@^14.6.7`.
- **Not added:** `@testing-library/jest-dom`.
- No peer conflicts.

### 2.7. Spec 001 tests superseded

The placeholder page goes away. The sign-in screen keeps the heading and the version label, but drops the "early skeleton" note. Assertions on that note (`src/App.test.tsx:20-21`, `src/main.test.tsx:42`, `e2e/published-build.test.ts:134`) are rewritten to the login heading in slice 1, and the lead adds a spec 001 Change Log line (**assumption**, consult open question 2).

---

## 3. Impact and Risk Analysis

- **System Dependencies:**
  - GREEN-API `getStateInstance` and `getSettings`, read-only.
  - The spec 001 build-info label, which moves into the login footer.
  - Nothing server-side.
- **Potential Risks & Mitigations** (riskiest first):
  1. **The real-instance happy path is unproven.** Unknowns: the derived URL vs the console's value, and the real `getSettings` shape. *Mitigation:* slice 1 = client + check + a bare form, verified by the user on a real instance **before** the UI work. The settings guard is strict (a string `webhookUrl` is required, per GREEN-API docs; review 3 F2). If the real instance shows `null`, relax it then.
  2. **GREEN-API 429** (~1 request/s per method). *Mitigation:* `resume()` outside effects, the busy lock, 429 → catch-all. No auto-retry.
  3. **Spec 001 tests break the gate.** *Mitigation:* rewrite them in the same slice (§2.7).
  4. **Empty-body 401/429 parsed as JSON.** *Mitigation:* status before parse, plus a unit test with an empty 401.
  5. **MSW intercepting the e2e tests' real local fetches.** *Mitigation:* `server.listen()` per test file, not in the global setup.
  6. **Token exposure** in the URL path (required by GREEN-API) and localStorage (accepted in architecture). *Mitigation:* never logged, never in messages.

---

## 4. Testing Strategy

- **Unit tests:**
  - `credentials.test.ts`: derivation (10 digits, 3 digits, letters, spaces), normalize, URL validation (`https://`, `http://x`, `https://x/`).
  - `messages.test.ts`: the unreachable text names the URL.
- **Client mapping tests** (`check-instance.test.ts`, MSW, table-driven), one case per row of §2.2:
  - 401 with an empty body, 403, `TypeError`, timeout (`timeoutMs: 50`), 429, 500;
  - 200 with `text/plain`, 200 with `{}`;
  - each state, plus an unknown one;
  - webhook set, notifications off, malformed settings;
  - `getSettings` not called when not authorized.
- **Integration tests** (RTL + MSW + user-event, `sign-in.test.tsx`, updated `App.test.tsx`) cover:
  - all of functional §2.1;
  - §2.2 c2 to c7 (c4 by swapping the handler before «Проверить снова»; c6 with a hung handler and fake timers; c7 counts exactly 1 request);
  - §2.3;
  - §2.4 c1/c2 by seeding localStorage, plus unreadable JSON → empty form;
  - §2.5.
- **Lead, in a real browser with fake credentials:** §2.2 c2 (real 401) and c3 (real `TypeError` with a mismatched host).
- **[User], with a real instance:**
  - §2.2 c1 (≤ 5 s);
  - §2.2 c4 and c5 (toggled in the console);
  - §2.4 c1/c2 on the live site;
  - the derived API URL matches the console.
- No Playwright e2e (D5 of spec 001 still applies).

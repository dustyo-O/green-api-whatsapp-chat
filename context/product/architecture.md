# System Architecture Overview: GREEN-API WhatsApp Chat

_A static, client-only React single-page app that talks to GREEN-API directly from the browser. No backend, no database, no proxy. Every choice below is sized for a 5-day test task that a reviewer must be able to run in ≤ 3 commands and open from a public link._

---

## 1. Application & Technology Stack

- **Language:** TypeScript (strict mode). _Alternative: JavaScript, rejected because types on the GREEN-API payloads are the cheapest guard against notification-shape bugs._
- **UI Framework:** React 19 (required by the brief).
- **Build Tool / Dev Server:** Vite. _Alternatives: Next.js (rejected: SSR and a server runtime add nothing to a static SPA and complicate GitHub Pages); CRA (deprecated)._
- **Package Manager:** npm, so a reviewer needs nothing beyond Node (`npm ci && npm run dev`). _Alternative: pnpm._
- **Client State:** Zustand, with its `persist` middleware writing to localStorage. It holds the session (credentials), the chats and the messages. _Alternatives: React Context + `useReducer` (no extra dependency, but persistence and selectors by hand); Redux Toolkit (too heavy for this scope)._
- **Server Communication:** a small typed API client over `fetch` (one function per GREEN-API method used), plus a dedicated **long-poll loop** for receiving. _Alternative: TanStack Query. Rejected, because the receive loop is a sequential receive → handle → delete cycle that doesn't fit a query cache, and sends are plain one-off calls._
- **Routing:** none. The app switches between the login, chat and other-tab screens based on state, not URL. This also avoids GitHub Pages' "404 on deep link" problem for single-page apps.
- **Styling:** CSS Modules + CSS custom properties for the WhatsApp Web palette and layout. _Alternative: Tailwind CSS, which is faster to write but adds config and noisier markup for a small UI. (Assumption.)_
- **Phone Number Handling:** our own normalizer: strip spaces, brackets, dashes and a leading `+`, require 10–15 digits, and build the chat id `<digits>@c.us`. _Alternative: `libphonenumber-js`, rejected for size; per-country validation isn't required._
- **Testing:** Vitest + React Testing Library for units and components, and **MSW (Mock Service Worker)** to fake GREEN-API in tests: the notification queue, the send endpoint and error responses. _Optional: one Playwright smoke test of the full flow against MSW, if Phase 3 has time._
- **Testing Stack by Layer:**
  - **Unit:** Vitest, for pure logic (phone normalization, notification parsing, dedupe/ordering, store reducers).
  - **Integration:** Vitest + React Testing Library + MSW (Node), for components and flows with GREEN-API faked at the network layer (login checks, send states, receive loop, error and offline states).
  - **E2E:** Playwright against `vite preview`, with MSW (browser worker) faking GREEN-API: one smoke test of credentials → new chat → send → incoming reply. Multi-tab behaviour (Web Locks) is tested here with two pages in one browser context.
  - **Contract:** none. The GREEN-API payload types are checked against the documented examples in unit tests.
  - **Manual acceptance:** one real-instance run of the full journey before submission (needs a real phone, so it can't be automated).
- **Code Quality:** ESLint (typescript-eslint, react-hooks) and Prettier. Prettier also runs from the harness `format.sh` PostToolUse hook.
- **Commit Messages:** Conventional Commits, enforced by commitlint (`@commitlint/config-conventional`) through a husky `commit-msg` hook locally and a commit-lint step over each PR's commits in CI. Conventions are in `CLAUDE.md` → "Commits".

---

## 2. Data & Persistence

- **Primary Store:** browser **localStorage**, through Zustand `persist`. There is no server-side storage. Data is keyed per `idInstance`, so switching instances doesn't mix chats.
- **Persisted Data:**
  - **Session:** `apiUrl`, whether it was customized, `idInstance`, `apiTokenInstance`.
  - **Chats:** `chatId`, the display phone number, and the last-activity time used for sorting.
  - **Messages:** `idMessage` (when known), a local id, direction, text, the GREEN-API `timestamp`, and status (`sending | sent | failed`).
  - **Drafts:** the unsent text per chat.
- **Deduplication & Ordering:** an incoming message is skipped if its `idMessage` already exists in that chat. Messages are sorted by GREEN-API `timestamp`, with arrival order breaking ties. An outgoing message gets its `idMessage` from the `SendMessage` response.
- **Write-before-acknowledge:** an incoming message is saved to the store, and therefore to localStorage, **before** `DeleteNotification` is called. If the tab dies in between, the notification comes back and the duplicate check absorbs it.
- **Logout:** clears the instance's persisted data and broadcasts the logout to other tabs.
- **Accepted risk:** `apiTokenInstance` is stored in plain localStorage, as the product definition decided. It is never logged and never put anywhere except the request URL path that GREEN-API itself requires. The README states this.

---

## 3. Infrastructure & Deployment

- **Hosting:** **GitHub Pages** (static). Vite `base` is set to `/<repo-name>/`.
- **CI/CD:** GitHub Actions. On every push and PR: lint → typecheck → test → build. On `main`: deploy with `actions/upload-pages-artifact` + `actions/deploy-pages`.
- **First deploy early:** a "hello world" deploy happens in **Phase 1, day 1**, so the live-site path (Pages base path and CORS from `*.github.io`) is checked before any features are built.
- **Local Run:** `git clone` → `npm ci` → `npm run dev` (≤ 3 commands, per the success metrics).
- **Environments:** local dev and production (Pages). No staging, and no secrets: credentials come from the user at runtime.
- **Browser Support:** current **Chrome and Safari** are verified (user decision 2026-10-05: the brief names no browsers). Other modern browsers are best-effort. The tab coordination below needs Web Locks and BroadcastChannel, which both support.

---

## 4. External Services & APIs

- **Messaging Provider:** **GREEN-API (WhatsApp)**. Called directly from the browser; verified on 2026-10-05 that it answers CORS with `Access-Control-Allow-Origin: *` and allows `Content-Type`, so no proxy is needed.
- **Base URL:** `{apiUrl}/waInstance{idInstance}/{method}/{apiTokenInstance}`. `apiUrl` is **per instance** and issued in the GREEN-API console (for example `https://7103.api.greenapi.com`). GREEN-API documents no rule for deriving it from `idInstance`.
- **How the login gets `apiUrl` (decided 2026-10-05):** the login form's **last field is "API URL"**. By default it is **disabled and auto-filled from `idInstance`**, updating live as the user types: `https://{first 4 digits of idInstance}.api.greenapi.com`, empty until 4 digits are entered. A **"Custom API URL" checkbox** makes the field editable so the user can paste the console value. Unticking it puts the derived value back. Whatever the field shows is exactly what the app uses; there is no hidden fallback host. A failed login whose error suggests the wrong host hints "check the API URL in your GREEN-API console". The derived pattern is to be confirmed against the author's real instance on day 1.
- **Methods Used:**
  - `getStateInstance`: at login and on every reload. `authorized` is required. `notAuthorized`, `blocked`, `sleepMode`, `starting` and `suspended` each map to a specific message for the user.
  - `getSettings`: at login, the readiness check. It requires `webhookUrl` to be empty and `incomingWebhook` to be `"yes"`; otherwise the user is told what to change in the console.
  - `sendMessage` (POST `{chatId, message}`): returns `idMessage`. HTTP success → `sent`; error or timeout → `failed` (no automatic retry).
  - `receiveNotification` (GET, `receiveTimeout` 5–60 s; we use about 20 s): long poll. An empty response means the queue is empty, so poll again.
  - `deleteNotification` (DELETE `/{receiptId}`): called after every notification, whether it was handled or skipped.
  - `getChatHistory`: Phase 4 stretch only.
- **Notification Handling:** only `incomingMessageReceived` with `typeMessage` of `textMessage` or `extendedTextMessage`, coming from a personal chat (`@c.us`), is turned into a message. Every other type (outgoing, statuses, groups `@g.us`, media and so on) is **deleted and skipped**, so the FIFO queue never stalls. Queue entries expire after 24 h on GREEN-API's side.
- **Single Poller (Tab Coordination):** the **Web Locks API** (`navigator.locks.request('greenapi-poller:<idInstance>')`) picks the one active tab that polls and sends. **BroadcastChannel** carries "take over here" and logout between tabs, and localStorage `storage` events keep the passive tabs' view of the data current.
- **Rate Limits & Errors:** HTTP 429 → back off and retry polling. Network failure → the "connection lost" state, with exponential backoff up to about 30 s, resuming automatically. 401/403 → "credentials invalid / instance not authorized" banner.

---

## 5. Observability & Monitoring

- **User-Facing Error Surface:** the main "monitoring" for this product. There are specific UI states for each failure in the product definition (bad credentials, not authorized, not ready to receive, connection lost, invalid number, failed send, other tab active).
- **Logging:** `console` in development only, behind a small `debug` helper that is a no-op in production builds. Credentials are never logged.
- **Error Boundary:** a top-level React error boundary with a "reload" action, so a render bug doesn't leave a blank page in front of a reviewer.
- **Analytics / APM:** none. Out of scope, and it would mean sending reviewer data to a third party.

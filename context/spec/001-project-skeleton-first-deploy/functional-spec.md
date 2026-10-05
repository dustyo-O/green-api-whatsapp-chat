# Functional Specification: Project Skeleton & First Deploy

- **Roadmap Item:** Phase 1 → Project Skeleton & First Deploy → Live "Hello" Page on GitHub Pages
- **Status:** Draft
- **Author:** Alexander Shleyko
- **Ticket:** TKT-1 · **Source:** `context/inbox/project-skeleton-first-deploy.md` (grill decisions D1–D9)

---

## 1. Overview and Rationale (The "Why")

The test task has to be reachable at a public link and runnable on a reviewer's own machine. If either of these is first tried at the end of the week, a surprise there (a blank public page, a project that won't start) puts the whole submission at risk with no time left to fix it.

This change proves both paths on day 1, before any chat features exist. There will be a public page at a fixed address that always shows which version of the project it is serving. The project will start locally with a few commands. Every proposed change will be checked automatically before it reaches the public page.

**Success looks like:** after any change is accepted into the main version of the project, the public page shows that change's version label within minutes. Anyone with the required runtime installed can start the project locally by following three commands from the project page.

---

## 2. Functional Requirements (The "What")

### 2.1. Public placeholder page

- The project has a public page at **https://dustyo-o.github.io/green-api-whatsapp-chat/**. It shows the app name ("GREEN-API WhatsApp Chat"), a short note that this is an early skeleton and the chat is not available yet, and a **version label** made of a short code identifying the exact version being shown and the date and time it was built.
  - **Acceptance Criteria:**
    - [ ] When a visitor opens the public address, then they see the app name, the skeleton note, a short version code and a build date and time.
    - [ ] When a visitor opens the public address in current Chrome, Firefox, Safari or Edge, then the page content is visible and never blank.
    - [ ] When a visitor opens the public address without the trailing slash (`…/green-api-whatsapp-chat`), then they still end up on the same page with the same content.

### 2.2. The public page always shows the latest accepted version

- Each time a change is accepted into the main version of the project **and passes the automatic checks (§2.3)**, the public page is updated to that version on its own, with no manual publishing step. The version code on the page matches the short code GitHub shows for that change. A change that fails its checks is never published (see §2.4).
- The public page never goes back to an older version: if two changes are accepted shortly one after another, the page ends up showing the later one, even if the earlier one takes longer to process.
  - **Acceptance Criteria:**
    - [ ] Given a change has been accepted into the main version and its automatic checks pass, when a visitor opens the public address 10 minutes or more after the change was accepted, then the version code on the page matches the short code GitHub shows for that change.
    - [ ] Given a change has been proposed but not yet accepted, when a visitor opens the public address, then the page still shows the version code of the previously accepted change.
    - [ ] Given two changes are accepted into the main version less than a minute apart, when a visitor opens the public address once all automatic runs on GitHub have finished, then the version code on the page matches the later of the two changes.

### 2.3. Automatic checks on every proposed change

- Every proposed change, and every update to the main version, is checked automatically: code style, consistency of the code, the automated tests, and a full build of the page. The result is shown on the change's page on GitHub as passed or failed.
  - **Acceptance Criteria:**
    - [ ] When someone proposes a change on GitHub, then an automatic check starts and its result (passed or failed) appears on that proposed change's page.
    - [ ] Given a proposed change breaks the build, when the automatic check finishes, then it is shown as failed and the public page keeps showing the previous version.

### 2.4. A failed check or update never takes the public page down

- If an accepted change fails its automatic checks, it is not published at all. If updating the public page fails for any other reason, the visitor also keeps seeing the previous working version. Either failure shows up in the project's list of automatic runs on GitHub, so the author notices it.
  - **Acceptance Criteria:**
    - [ ] Given a change accepted into the main version fails its automatic checks (for example, a test fails), when a visitor opens the public address after the run has finished, then they see the previous version's page with its previous version code.
    - [ ] Given an accepted change whose update of the public page fails, when a visitor opens the public address, then they see the previous version's page with its previous version code, not an error or a blank page.
    - [ ] Given an accepted change whose update of the public page fails, when the author opens the project's list of automatic runs on GitHub, then that run is marked as failed.

### 2.5. Run locally in three commands

- Anyone with the required runtime (Node.js 22) can download the project and start it with at most three commands. Locally, the page looks the same as the public one, but its version label says **"local"** instead of a version code.
  - **Acceptance Criteria:**
    - [ ] Given a computer with Node.js 22 and no copy of the project, when the person runs the commands listed on the project page (at most three, starting with downloading the project), then the page opens in their browser at the local address those instructions print.
    - [ ] When the page is opened locally, then the version label reads "local" in place of the version code, and everything else on the page matches the public page.
    - [ ] Given a computer with a different major version of Node.js, when the person installs the project, then they see a warning naming Node.js 22 as the required version.

### 2.6. Every saved change is described in the shared format

- Each saved change carries a short description in the project's shared format: a kind of change (new feature, fix, documentation, build/checks setup, maintenance and so on), the affected part of the app, and a one-line summary, optionally followed by the ticket it belongs to. This keeps the project history readable for reviewers. A description that doesn't follow the format is refused both on the author's computer and in the automatic checks.
  - **Acceptance Criteria:**
    - [ ] When the author saves a change described as "feat(app): show build version on placeholder page", then the change is saved.
    - [ ] When the author tries to save a change described as "updated stuff", then the save is refused with a message explaining the expected format.
    - [ ] Given a proposed change on GitHub contains a saved change whose description doesn't follow the format, when the automatic check finishes, then it is shown as failed and names that description.

### 2.7. Project page explains the essentials

- The project's front page on GitHub shows a one-line description of the project, the "run locally" commands (at most three), and a link to the public page.
  - **Acceptance Criteria:**
    - [ ] When a reviewer opens the project's front page on GitHub, then they see a one-line description, a "Run locally" section with at most three commands, and a working link to the public page.

---

## 3. Scope and Boundaries

### In-Scope

- The public placeholder page with app name, skeleton note and version label.
- Updating the public page automatically when a change is accepted into the main version and passes its checks; the page never goes back to an older version.
- Automatic checks (style, code consistency, tests, build) on every proposed change and on the main version.
- Keeping the previous public page live when a check or an update fails.
- Confirming on day 1 that the public page's address is allowed to talk to GREEN-API from a visitor's browser (an author-run check; no chat feature is built for it).
- Starting the project locally with at most three commands, with a pinned runtime version.
- A minimal project front page: description, run-locally commands, link to the public page.
- A shared format for describing saved changes, enforced on the author's computer and in the automatic checks.
- One-off project setup (done with the author's explicit OK at each step): creating the public GitHub project, connecting it, and switching on the public page. The author makes the very first save of the project and publishes it themselves.

### Out-of-Scope

- Any chat functionality: sign-in with GREEN-API credentials, chats, sending and receiving messages. Covered by the later roadmap items "Sign-In & Session", "Chats & Sending" and "Receiving Replies".
- WhatsApp Web look and feel: the placeholder page is plain. Covered by "Chats & Sending".
- Connection/authorization states and single-active-tab behaviour: "Connection & Authorization States" and "One Active Tab".
- The full reviewer guide (instance setup prerequisites, deviations from the brief), screenshots, demo video and the submission email: "Documentation", "Public Delivery" and "Submission".
- Chat history: "Chat History" (stretch).
- Browser-driven end-to-end tests as part of the automatic checks.
- Rules that stop a change from being accepted while checks are failing, a separate preview page for each proposed change, and a custom domain name.
- Offline use and use across multiple devices: not applicable to a static placeholder page.

---

## Change Log

_Dated amendments made after the spec was first written — typically by `/awos:spec` in Update Mode when a bug fix changed documented behavior. Each entry records the date, the source reference (bug id or fix description), and what behavior changed and why. Leave empty until the first amendment._

- 2026-10-05 — user decision after review `spec-codex-20261005-1707` — added §2.6 (shared format for describing saved changes, i.e. Conventional Commits, enforced locally and in the automatic checks) and the matching in-scope line; the former §2.6 is now §2.7. Added after the stage-2 review, so the stage-3 review must cover it.

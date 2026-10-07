// @layer: integration
// @spec: 005-connection-auth-states
import { act, screen, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { delay, http, HttpResponse } from "msw";
import type { Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  API_URL,
  deleted,
  failure,
  queue,
  ready,
  server,
  setupGreenApiServer,
} from "../test/green-api-server";
import { stateChanged, textBody } from "./notification.fixtures";

setupGreenApiServer();

const ID = "7103123456";
const RU = "79037474411@c.us";

const OFFLINE = "Нет соединения. Переподключаемся…";
const NOT_AUTHORIZED =
  "Инстанс не авторизован. Отсканируйте QR-код в консоли GREEN-API.";
const BLOCKED = "Инстанс заблокирован. Проверьте его в консоли GREEN-API.";
const KEY = "Ключ доступа больше не действует. Войдите заново.";
const STUCK = "Не удаётся получить новые сообщения. Пробуем снова…";
const INTRO = "Выберите чат, чтобы начать переписку";

let receipts = 0;
const notification = (body: unknown) => ({ receiptId: ++receipts, body });
const reply = (text: string) =>
  notification(
    textBody(text, {
      chatId: RU,
      idMessage: `ID${String(receipts)}`,
      timestamp: Math.floor(Date.now() / 1000),
    }),
  );

// main.tsx owns its root; the helper keeps it so the next test unmounts it (spec 004 ledger).
let root: Root | undefined;

function unmount() {
  const previous = root;
  root = undefined;
  if (previous) {
    act(() => {
      previous.unmount();
    });
  }
}

/** Signed in, with a `+7 903 747-44-11` chat holding one sent message; the page open. */
async function openPage() {
  localStorage.setItem(
    "green-api-chat:session",
    JSON.stringify({
      state: {
        credentials: {
          idInstance: ID,
          apiTokenInstance: "faketoken",
          apiUrl: API_URL,
          customApiUrl: false,
        },
      },
      version: 1,
    }),
  );
  localStorage.setItem(
    `green-api-chat:chats:${ID}`,
    JSON.stringify({
      state: {
        chats: {
          [RU]: {
            id: RU,
            createdAt: 1_000,
            draft: "",
            messages: [
              {
                id: "out-1",
                direction: "out",
                text: "Привет",
                time: 2_000,
                status: "sent",
                idMessage: "OUT-1",
              },
            ],
          },
        },
      },
      version: 1,
    }),
  );
  server.use(...ready());
  unmount();
  document.body.innerHTML = '<div id="root"></div>';
  vi.resetModules();
  vi.doMock("react-dom/client", async (importOriginal) => {
    const client = await importOriginal<typeof import("react-dom/client")>();
    return {
      ...client,
      createRoot: (...args: Parameters<typeof client.createRoot>) =>
        (root = client.createRoot(...args)),
    };
  });
  await act(async () => {
    await import("../main");
  });
  await screen.findByText(`Инстанс ${ID}`);
}

async function openChat(user: UserEvent) {
  await openPage();
  await user.click(
    within(screen.getByRole("list", { name: "Чаты" })).getByRole("button"),
  );
}

/** Fake timeouts that also follow real time, so the page and MSW run on their own. */
function fakeTimers() {
  vi.useFakeTimers({
    toFake: ["setTimeout", "clearTimeout"],
    shouldAdvanceTime: true,
  });
  return userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
}

const banner = () => screen.queryByRole("status");
const bannerText = () => banner()?.textContent ?? null;
const bannerIs = (variant: string) =>
  [...(banner()?.classList ?? [])].some((c) => c.startsWith(`_${variant}_`));
const chatTitles = () =>
  within(screen.getByRole("list", { name: "Чаты" }))
    .getAllByRole("button")
    .map((b) => b.firstChild?.textContent);
const bubbleTexts = () =>
  within(screen.getByRole("list", { name: "Сообщения" }))
    .queryAllByRole("listitem")
    .map((b) => b.firstChild?.textContent);

function goOffline() {
  act(() => {
    window.dispatchEvent(new Event("offline"));
  });
}

/** While `down`, the device can't reach GREEN-API: every receive fails like offline. */
function network() {
  const state = { down: false };
  server.use(
    http.get("*/receiveNotification/*", () =>
      state.down ? HttpResponse.error() : undefined,
    ),
  );
  return state;
}

afterEach(() => {
  unmount();
  document.body.innerHTML = "";
  localStorage.clear();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.doUnmock("react-dom/client");
});

describe("§2.1 one banner at a time", () => {
  // @regression — functional §2.1 c1
  it("shows only the auth banner over no connection, then no connection once authorized", async () => {
    await openPage();
    queue(notification(stateChanged("notAuthorized")));
    await vi.waitFor(() => {
      expect(bannerText()).toBe(NOT_AUTHORIZED);
    });

    goOffline();

    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(bannerText()).toBe(NOT_AUTHORIZED);
    expect(screen.queryByText(OFFLINE)).toBeNull();

    // Authorized again, and the connection is still down right after.
    queue(
      notification(stateChanged("authorized")),
      HttpResponse.error(),
      HttpResponse.error(),
    );
    await vi.waitFor(
      () => {
        expect(bannerText()).toBe(OFFLINE);
      },
      { timeout: 3_000 },
    );
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });

  // @regression — functional §2.1 c2
  it("shows the banner above «Выберите чат…» when no chat is open", async () => {
    await openPage();

    goOffline();

    const shown = screen.getByRole("status");
    expect(shown.textContent).toBe(OFFLINE);
    expect(
      shown.compareDocumentPosition(screen.getByText(INTRO)) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});

describe("§2.2 no connection", () => {
  // @regression — functional §2.2 c1
  it("shows «Нет соединения» within 3 s of the device going offline", async () => {
    fakeTimers();
    await openPage();
    expect(banner()).toBeNull();

    goOffline();
    await act(() => vi.advanceTimersByTimeAsync(3_000));

    expect(bannerText()).toBe(OFFLINE);
    expect(bannerIs("warning")).toBe(true);
  });

  // @regression — functional §2.2 c2
  it("shows «Нет соединения» within 20 s when GREEN-API stops answering and the device stays online", async () => {
    fakeTimers();
    let stalled = false;
    server.use(
      http.get("*/receiveNotification/*", async () => {
        if (!stalled) return;
        await delay("infinite");
        return new HttpResponse(null);
      }),
    );
    await openPage();
    stalled = true;
    queue(); // ends the poll in flight

    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(banner()).toBeNull();
    await act(() => vi.advanceTimersByTimeAsync(10_000));

    expect(bannerText()).toBe(OFFLINE);
  });

  // @regression — functional §2.2 c3
  it("hides the banner within 10 s of the device coming back, and the replies sent meanwhile appear", async () => {
    const user = fakeTimers();
    const net = network();
    await openChat(user);
    net.down = true;
    goOffline();
    queue(reply("Я тут"));
    await act(() => vi.advanceTimersByTimeAsync(30_000));
    expect(bannerText()).toBe(OFFLINE);

    net.down = false;
    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    await act(() => vi.advanceTimersByTimeAsync(10_000));

    expect(banner()).toBeNull();
    expect(bubbleTexts()).toEqual(["Привет", "Я тут"]);
  });
});

describe("§2.3 instance not authorized", () => {
  // @regression — functional §2.3 c1, c2
  it("shows the red banner when logged out, keeps the chats, and hides it once authorized again", async () => {
    const user = userEvent.setup();
    await openChat(user);

    queue(notification(stateChanged("notAuthorized")));

    await vi.waitFor(() => {
      expect(bannerText()).toBe(NOT_AUTHORIZED);
    });
    expect(bannerIs("danger")).toBe(true);
    expect(chatTitles()).toEqual(["+7 903 747-44-11"]);
    expect(bubbleTexts()).toEqual(["Привет"]);
    expect(screen.getByText(`Инстанс ${ID}`)).toBeDefined(); // still signed in

    queue(notification(stateChanged("authorized")));

    await vi.waitFor(() => {
      expect(banner()).toBeNull();
    });
    expect(bubbleTexts()).toEqual(["Привет"]);
  });

  // @regression — functional §2.3 c3 (the text; sending paused is slice 2)
  it("reads «Инстанс заблокирован…» when the instance is blocked", async () => {
    await openPage();

    queue(notification(stateChanged("blocked")));

    await vi.waitFor(() => {
      expect(bannerText()).toBe(BLOCKED);
    });
    expect(bannerIs("danger")).toBe(true);
  });
});

describe("§2.4 access key no longer works", () => {
  // @regression — functional §2.4 c1
  it("shows the key banner with «Выйти», which leads to the empty sign-in form", async () => {
    const user = userEvent.setup();
    await openChat(user);

    queue(failure(401));

    const shown = await screen.findByRole("status");
    expect(shown.firstChild?.textContent).toBe(KEY);
    expect(bannerIs("danger")).toBe(true);
    expect(screen.getByText(`Инстанс ${ID}`)).toBeDefined(); // not signed out by itself

    await user.click(within(shown).getByRole("button", { name: "Выйти" }));

    expect(
      (await screen.findByLabelText<HTMLInputElement>("idInstance")).value,
    ).toBe("");
    expect(
      screen.getByLabelText<HTMLInputElement>("apiTokenInstance").value,
    ).toBe("");
    expect(banner()).toBeNull();
  });
});

describe("§2.5 receiving stuck", () => {
  // @regression — functional §2.5 c1
  it("shows the grey banner after a minute of errors, and hides it when GREEN-API answers normally", async () => {
    fakeTimers();
    let failing = false;
    server.use(
      http.get("*/receiveNotification/*", () =>
        failing ? failure(500) : undefined,
      ),
    );
    await openPage();
    failing = true;
    queue(); // ends the poll in flight

    await act(() => vi.advanceTimersByTimeAsync(65_000));
    expect(bannerText()).toBe(STUCK);
    expect(bannerIs("muted")).toBe(true);

    failing = false;
    queue(null);
    await act(() => vi.advanceTimersByTimeAsync(6_000));

    expect(banner()).toBeNull();
  });

  // @regression — functional §2.5 c2
  it("shows the grey banner when a reply keeps being taken in but can't be cleared", async () => {
    const user = fakeTimers();
    server.use(http.delete("*/deleteNotification/*/*", () => failure(503)));
    await openChat(user);

    queue(reply("Застряло"));
    await act(() => vi.advanceTimersByTimeAsync(65_000));

    expect(bannerText()).toBe(STUCK);
    expect(deleted.length).toBeGreaterThan(1);
    expect(bubbleTexts()).toEqual(["Привет", "Застряло"]); // shown once
  });

  // @regression — functional §2.5 c3
  it("shows no grey banner while errors have lasted less than a minute", async () => {
    fakeTimers();
    let failing = false;
    server.use(
      http.get("*/receiveNotification/*", () =>
        failing ? failure(500) : undefined,
      ),
    );
    await openPage();
    failing = true;
    queue();

    await act(() => vi.advanceTimersByTimeAsync(50_000));

    expect(banner()).toBeNull();
  });
});

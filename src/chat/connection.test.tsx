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
  posted,
  queue,
  ready,
  reply as answer,
  requests,
  sentAs,
  server,
  setupGreenApiServer,
  stateIs,
  status,
  whatsappExists,
} from "../test/green-api-server";
import { stateChanged, textBody } from "./notification.fixtures";

setupGreenApiServer();

const ID = "7103123456";
const RU = "79037474411@c.us";

const OFFLINE = "Нет соединения. Переподключаемся…";
const NOT_AUTHORIZED =
  "Инстанс не авторизован. Отсканируйте QR-код в консоли GREEN-API.";
const BLOCKED = "Инстанс заблокирован. Проверьте его в консоли GREEN-API.";
const RESTRICTED =
  "Работа инстанса временно ограничена. Проверьте его в консоли GREEN-API.";
const KEY = "Ключ доступа больше не действует. Войдите заново.";
const STUCK = "Не удаётся получить новые сообщения. Пробуем снова…";
const INTRO = "Выберите чат, чтобы начать переписку";
const PLACEHOLDER = "Введите сообщение";
const OFFLINE_PLACEHOLDER =
  "Нет соединения — сообщение можно будет отправить позже";
const AUTH_PLACEHOLDER = "Инстанс не авторизован — отправка недоступна";
const KEY_PLACEHOLDER = "Ключ доступа не действует — отправка недоступна";

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

/** Signed in, with a `+7 903 747-44-11` chat holding one sent message (then `more`); the page open. */
async function openPage(more: unknown[] = []) {
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
              ...more,
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

async function openChat(user: UserEvent, more: unknown[] = []) {
  await openPage(more);
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

const composer = () => screen.getByRole<HTMLTextAreaElement>("textbox");
const lastBubble = () =>
  within(screen.getByRole("list", { name: "Сообщения" }))
    .getAllByRole("listitem")
    .at(-1)?.textContent ?? "";

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
    fakeTimers();
    await openPage();
    queue(notification(stateChanged("notAuthorized")));
    await vi.waitFor(() => {
      expect(bannerText()).toBe(NOT_AUTHORIZED);
    });

    goOffline();

    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(bannerText()).toBe(NOT_AUTHORIZED);
    expect(screen.queryByText(OFFLINE)).toBeNull();

    // Authorized again, and the connection is still down right after: 15 s with no answer.
    queue(
      notification(stateChanged("authorized")),
      HttpResponse.error(),
      HttpResponse.error(),
    );
    await act(() => vi.advanceTimersByTimeAsync(20_000));
    expect(bannerText()).toBe(OFFLINE);
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

  // @regression — functional §2.3 c3
  it("reads «Инстанс заблокирован…» when the instance is blocked, and sending is paused", async () => {
    const user = userEvent.setup();
    server.use(sentAs("BAE5"));
    await openChat(user);

    queue(notification(stateChanged("blocked")));

    await vi.waitFor(() => {
      expect(bannerText()).toBe(BLOCKED);
    });
    expect(bannerIs("danger")).toBe(true);
    await user.type(composer(), "Привет{Enter}");
    expect(bubbleTexts()).toEqual(["Привет"]);
    expect(composer().value).toBe("Привет");
    expect(posted).toEqual([]);
  });

  // @regression — functional §2.3: every non-authorized state reads its sign-in text
  it.each([
    [
      "sleepMode",
      "Телефон с WhatsApp не в сети. Включите его и проверьте снова.",
    ],
    ["starting", "Инстанс запускается. Попробуйте через минуту."],
    ["yellowCard", RESTRICTED],
    ["suspended", RESTRICTED],
  ])(
    "reads the sign-in text for %s, in red, and pauses sending",
    async (state, text) => {
      const user = userEvent.setup();
      await openChat(user);

      queue(notification(stateChanged(state)));

      await vi.waitFor(() => {
        expect(bannerText()).toBe(text);
      });
      expect(bannerIs("danger")).toBe(true);
      expect(composer().placeholder).toBe(AUTH_PLACEHOLDER);
    },
  );

  // @regression — functional §2.3 c4 and recovery, tech §2.1: no notification at all, only the 4-minute watch
  it("shows the red banner within 5 minutes of a logout when nothing else happens, and hides it within 5 minutes of a new login", async () => {
    fakeTimers();
    // A healthy long poll that comes back empty every 5 s.
    server.use(
      http.get("*/receiveNotification/*", async () => {
        await delay(5_000);
        return new HttpResponse("", {
          headers: { "Content-Type": "application/json" },
        });
      }),
    );
    await openPage();
    server.use(stateIs("notAuthorized")); // logged out in the console

    for (let s = 0; s < 3 * 60; s++) {
      await act(() => vi.advanceTimersByTimeAsync(1_000));
    }
    expect(banner()).toBeNull();
    for (let s = 0; s < 2 * 60; s++) {
      await act(() => vi.advanceTimersByTimeAsync(1_000));
    }

    expect(bannerText()).toBe(NOT_AUTHORIZED);
    expect(bannerIs("danger")).toBe(true);

    server.use(stateIs("authorized")); // the QR code is scanned again
    for (let s = 0; s < 5 * 60; s++) {
      await act(() => vi.advanceTimersByTimeAsync(1_000));
    }

    expect(banner()).toBeNull();
  });
});

describe("§2.4 access key no longer works", () => {
  // @regression — functional §2.4 c1
  it("shows the key banner with «Выйти», which leads to the empty sign-in form", async () => {
    const user = userEvent.setup();
    server.use(sentAs("BAE5"));
    await openChat(user);

    server.use(status("getStateInstance", 401)); // the check after a 401 confirms the key
    queue(failure(401));

    const shown = await screen.findByRole("status");
    expect(shown.firstChild?.textContent).toBe(KEY);
    expect(bannerIs("danger")).toBe(true);
    expect(screen.getByText(`Инстанс ${ID}`)).toBeDefined(); // not signed out by itself
    expect(composer().placeholder).toBe(KEY_PLACEHOLDER);
    await user.type(composer(), "Привет{Enter}"); // functional §2.6: the key banner pauses sending
    expect(bubbleTexts()).toEqual(["Привет"]);
    expect(composer().value).toBe("Привет");
    expect(posted).toEqual([]);

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

describe("§2.6 sending paused", () => {
  const newChatNumber = () =>
    screen.getByRole<HTMLInputElement>("textbox", { name: "Номер телефона" });
  const startButton = () =>
    screen.getByRole<HTMLButtonElement>("button", {
      name: /Начать чат|Проверяем…/,
    });

  // @regression — functional §2.6 c1, c3
  it("keeps «Привет» unsent while offline, explains it in the placeholder, and sends it once the banner is gone", async () => {
    const user = userEvent.setup();
    server.use(sentAs("BAE5"));
    await openChat(user);
    expect(composer().placeholder).toBe(PLACEHOLDER);
    goOffline();
    expect(bannerText()).toBe(OFFLINE);

    await user.type(composer(), "Привет{Enter}");

    expect(composer().value).toBe("Привет");
    expect(bubbleTexts()).toEqual(["Привет"]);
    expect(posted).toEqual([]);
    expect(composer().placeholder).toBe(OFFLINE_PLACEHOLDER);

    queue(null); // GREEN-API answers again
    await vi.waitFor(() => {
      expect(banner()).toBeNull();
    });
    expect(composer().value).toBe("Привет");
    expect(composer().placeholder).toBe(PLACEHOLDER);
    await user.type(composer(), "{Enter}");

    await vi.waitFor(() => {
      expect(lastBubble()).toContain("✅");
    });
    expect(bubbleTexts()).toEqual(["Привет", "Привет"]);
    expect(posted.map((p) => p.body)).toEqual([
      { chatId: RU, message: "Привет" },
    ]);
    expect(composer().value).toBe("");
  });

  // @regression — functional §2.6 c2
  it("creates no bubble on Enter while the instance isn't authorized", async () => {
    const user = userEvent.setup();
    server.use(sentAs("BAE5"));
    await openChat(user);
    queue(notification(stateChanged("notAuthorized")));
    await vi.waitFor(() => {
      expect(bannerText()).toBe(NOT_AUTHORIZED);
    });

    await user.type(composer(), "Ещё раз{Enter}");

    expect(bubbleTexts()).toEqual(["Привет"]);
    expect(composer().value).toBe("Ещё раз");
    expect(composer().placeholder).toBe(AUTH_PLACEHOLDER);
    expect(posted).toEqual([]);
  });

  // @regression — functional §2.6: a message already on its way finishes with GREEN-API's answer
  it("marks a message sent before the banner appeared with ✅ once GREEN-API accepts it", async () => {
    const user = userEvent.setup();
    let release = () => {};
    const answered = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      answer("sendMessage", async () => {
        await answered;
        return HttpResponse.json({ idMessage: "BAE5" });
      }),
    );
    await openChat(user);
    await user.type(composer(), "В пути{Enter}");
    await vi.waitFor(() => {
      expect(posted).toHaveLength(1);
    });

    goOffline();
    expect(bannerText()).toBe(OFFLINE);
    release();

    await vi.waitFor(() => {
      expect(lastBubble()).toContain("✅");
    });
    expect(bubbleTexts()).toEqual(["Привет", "В пути"]);
    expect(posted).toHaveLength(1);
  });

  // @regression — functional §2.6 c4
  it("creates no chat from «+» while offline", async () => {
    const user = userEvent.setup();
    server.use(whatsappExists(true));
    await openPage();
    goOffline();

    await user.click(screen.getByRole("button", { name: "Новый чат" }));
    await user.type(newChatNumber(), "9161234567");
    expect(startButton().disabled).toBe(true);
    await user.click(startButton());
    await user.type(newChatNumber(), "{Enter}");

    expect(requests).not.toContain("checkWhatsapp");
    expect(chatTitles()).toEqual(["+7 903 747-44-11"]);
    expect(newChatNumber().value).toBe("9161234567");
  });

  // @regression — functional §2.6 c4, review 3 F4: a check still running when the pause starts
  it("creates no chat when the pause starts while the number is being checked, and keeps the number", async () => {
    const user = userEvent.setup();
    let release = () => {};
    const answered = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      answer("checkWhatsapp", async () => {
        await answered;
        return HttpResponse.json({ existsWhatsapp: true });
      }),
    );
    await openPage();
    await user.click(screen.getByRole("button", { name: "Новый чат" }));
    await user.type(newChatNumber(), "9161234567{Enter}");
    await vi.waitFor(() => {
      expect(startButton().textContent).toBe("Проверяем…");
    });

    goOffline();
    release();

    await vi.waitFor(() => {
      expect(startButton().textContent).toBe("Начать чат");
    });
    expect(chatTitles()).toEqual(["+7 903 747-44-11"]);
    expect(newChatNumber().value).toBe("9161234567");
    expect(screen.queryByRole("alert")).toBeNull();

    queue(null); // the banner goes away; the kept number can start the chat now
    await vi.waitFor(() => {
      expect(startButton().disabled).toBe(false);
    });
    await user.click(startButton());
    await vi.waitFor(() => {
      expect(chatTitles()).toEqual(["+7 916 123-45-67", "+7 903 747-44-11"]);
    });
  });

  // @regression — functional §2.6 c5
  it("sends nothing on «Повторить» while the instance isn't authorized, and the message keeps ❗", async () => {
    const user = userEvent.setup();
    server.use(sentAs("BAE5"));
    await openChat(user, [
      {
        id: "out-2",
        direction: "out",
        text: "Не ушло",
        time: 3_000,
        status: "failed",
      },
    ]);
    queue(notification(stateChanged("notAuthorized")));
    await vi.waitFor(() => {
      expect(bannerText()).toBe(NOT_AUTHORIZED);
    });

    const retry = screen.getByRole<HTMLButtonElement>("button", {
      name: "Повторить",
    });
    expect(retry.disabled).toBe(true);
    await user.click(retry);

    expect(lastBubble()).toContain("❗");
    expect(posted).toEqual([]);
  });

  // @regression — tech Round 2 (pr #16): a 503 is an answer, so the offline banner can't stay up
  it("clears «Нет соединения» once GREEN-API answers 503, shows the grey banner after a minute, and sends", async () => {
    const user = fakeTimers();
    server.use(sentAs("BAE5"));
    const net = { mode: "up" };
    server.use(
      http.get("*/receiveNotification/*", () => {
        if (net.mode === "down") return HttpResponse.error();
        if (net.mode === "503") return failure(503);
      }),
    );
    await openChat(user);
    net.mode = "down";
    queue(); // ends the poll in flight
    await act(() => vi.advanceTimersByTimeAsync(20_000));
    expect(bannerText()).toBe(OFFLINE);

    net.mode = "503";
    await act(() => vi.advanceTimersByTimeAsync(6_000)); // the backoff is at most 5 s
    expect(banner()).toBeNull();
    expect(composer().placeholder).toBe(PLACEHOLDER);
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(bannerText()).toBe(STUCK);

    await user.type(composer(), "Привет{Enter}");

    await vi.waitFor(() => {
      expect(lastBubble()).toContain("✅");
    });
    expect(posted.map((p) => p.body)).toEqual([
      { chatId: RU, message: "Привет" },
    ]);
  });

  // @regression — functional §2.6 c6
  it("sends as usual while only the grey banner is shown", async () => {
    const user = fakeTimers();
    server.use(sentAs("BAE5"));
    let failing = false;
    server.use(
      http.get("*/receiveNotification/*", () =>
        failing ? failure(500) : undefined,
      ),
    );
    await openChat(user);
    failing = true;
    queue(); // ends the poll in flight
    await act(() => vi.advanceTimersByTimeAsync(65_000));
    expect(bannerText()).toBe(STUCK);
    expect(composer().placeholder).toBe(PLACEHOLDER);

    await user.type(composer(), "Всё равно{Enter}");

    await vi.waitFor(() => {
      expect(lastBubble()).toContain("✅");
    });
    expect(bubbleTexts()).toEqual(["Привет", "Всё равно"]);
    expect(posted.map((p) => p.body)).toEqual([
      { chatId: RU, message: "Всё равно" },
    ]);
  });
});

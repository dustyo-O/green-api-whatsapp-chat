// @layer: integration
// @spec: 002-sign-in-session
import { act, screen, waitFor } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  API_URL,
  hang,
  ready,
  reply,
  requests,
  server,
  settingsAre,
  stateIs,
  status,
  unreachable,
  setupGreenApiServer,
} from "../test/green-api-server";

setupGreenApiServer();

const STORAGE_KEY = "green-api-chat:session";
const SAVED = {
  idInstance: "7103123456",
  apiTokenInstance: "faketoken",
  apiUrl: API_URL,
  customApiUrl: false,
};

/** Opens (or reloads) the page: fresh modules, index.html's root, then main.tsx as the browser runs it. */
async function openPage() {
  document.body.innerHTML = '<div id="root"></div>';
  vi.resetModules();
  await act(async () => {
    await import("../main");
  });
}

function saveSession(credentials: unknown) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ state: { credentials }, version: 1 }),
  );
}

/** A handler that answers only once `open()` is called. */
function gated(
  method: "getStateInstance" | "getSettings",
  body: Record<string, unknown>,
) {
  let open = () => {};
  const gate = new Promise<void>((resolve) => {
    open = resolve;
  });
  return {
    handler: reply(method, async () => {
      await gate;
      return HttpResponse.json(body);
    }),
    open: () => {
      open();
    },
  };
}

const field = (label: string) => screen.getByLabelText<HTMLInputElement>(label);
const signInButton = () =>
  screen.getByRole<HTMLButtonElement>("button", { name: /Войти|Проверяем…/ });

async function fillIn(
  user: UserEvent,
  idInstance = "7103123456",
  token = "faketoken",
) {
  await user.type(field("idInstance"), idInstance);
  await user.type(field("apiTokenInstance"), token);
}

async function signIn(user: UserEvent) {
  await fillIn(user);
  await user.click(signInButton());
}

const ID_HINT = "Только цифры, например 7103123456.";
const URL_HINT = "Полный адрес, начинающийся с https://";

afterEach(() => {
  document.body.innerHTML = "";
  localStorage.clear();
  vi.useRealTimers();
});

describe("§2.1 sign-in form", () => {
  it("starts empty with «Войти» inactive and no hints", async () => {
    await openPage();

    expect(field("idInstance").value).toBe("");
    expect(field("apiTokenInstance").value).toBe("");
    expect(field("API URL").value).toBe("");
    expect(signInButton().disabled).toBe(true);
    expect(screen.queryByText(ID_HINT)).toBeNull();
    expect(screen.queryByText(URL_HINT)).toBeNull();
  });

  // @regression — functional §2.1 c1
  it("fills in a read-only API URL from the first four digits of idInstance", async () => {
    const user = userEvent.setup();
    await openPage();

    await user.type(field("idInstance"), "710");
    expect(field("API URL").value).toBe("");

    await user.type(field("idInstance"), "3123456");
    expect(field("API URL").value).toBe("https://7103.api.greenapi.com");
    expect(field("API URL").readOnly).toBe(true);
  });

  // @regression — functional §2.1 c2
  it("lets the user type another API URL and puts the filled-in one back on untick", async () => {
    const user = userEvent.setup();
    await openPage();
    await user.type(field("idInstance"), "7103123456");

    await user.click(field("Указать API URL вручную"));
    expect(field("API URL").readOnly).toBe(false);
    await user.clear(field("API URL"));
    await user.type(field("API URL"), "https://custom.example");
    expect(field("API URL").value).toBe("https://custom.example");

    await user.click(field("Указать API URL вручную"));
    expect(field("API URL").value).toBe("https://7103.api.greenapi.com");
    expect(field("API URL").readOnly).toBe(true);
  });

  // @regression — functional §2.1 c3
  it("hints at digits-only and keeps «Войти» inactive when idInstance has letters", async () => {
    const user = userEvent.setup();
    await openPage();

    await fillIn(user, "7103abc");

    expect(screen.getByText(ID_HINT)).toBeDefined();
    expect(signInButton().disabled).toBe(true);
  });

  // @regression — functional §2.1 c4
  it("hints at a full https address and keeps «Войти» inactive for a bare https://", async () => {
    const user = userEvent.setup();
    await openPage();
    await fillIn(user);

    await user.click(field("Указать API URL вручную"));
    await user.clear(field("API URL"));
    await user.type(field("API URL"), "https://");

    expect(screen.getByText(URL_HINT)).toBeDefined();
    expect(signInButton().disabled).toBe(true);
  });

  // @regression — functional §2.1 c5
  it("switches the token between dots and readable text", async () => {
    const user = userEvent.setup();
    await openPage();
    expect(field("apiTokenInstance").type).toBe("password");

    await user.click(screen.getByRole("button", { name: "Показать" }));
    expect(field("apiTokenInstance").type).toBe("text");

    await user.click(screen.getByRole("button", { name: "Скрыть" }));
    expect(field("apiTokenInstance").type).toBe("password");
  });

  // @regression — functional §2.1: spaces at the start and end are ignored
  it("ignores spaces around the values", async () => {
    server.use(...ready());
    const user = userEvent.setup();
    await openPage();

    await fillIn(user, "  7103123456 ", " faketoken ");
    await user.click(signInButton());

    expect(await screen.findByText("Инстанс 7103123456")).toBeDefined();
  });

  // @regression — functional §2.1: only a plain https address (a trailing `/` is ignored)
  it.each([
    ["http://7103.api.greenapi.com", true],
    ["https://7103.api.greenapi.com/base", true],
    ["https://7103.api.greenapi.com?x=1", true],
    ["https://7103.api.greenapi.com/#x", true],
    ["https://7103.api.greenapi.com/", false],
  ])("API URL %s → hint: %s", async (apiUrl, invalid) => {
    const user = userEvent.setup();
    await openPage();
    await fillIn(user);

    await user.click(field("Указать API URL вручную"));
    await user.clear(field("API URL"));
    await user.type(field("API URL"), apiUrl);

    expect(screen.queryByText(URL_HINT) !== null).toBe(invalid);
    expect(signInButton().disabled).toBe(invalid);
  });

  // @regression — functional §2.1: an empty field keeps «Войти» inactive without a hint
  it("keeps «Войти» inactive without a hint for a token of spaces only", async () => {
    const user = userEvent.setup();
    await openPage();

    await fillIn(user, "7103123456", "   ");

    expect(signInButton().disabled).toBe(true);
    expect(screen.queryByText(ID_HINT)).toBeNull();
    expect(screen.queryByText(URL_HINT)).toBeNull();
  });
});

describe("§2.2 signing in only with a ready instance", () => {
  // @regression — functional §2.2 messages table: one message per situation, input kept, «Проверить снова»
  it.each([
    [
      "the phone is offline",
      [stateIs("sleepMode")],
      "Телефон с WhatsApp не в сети. Включите его и проверьте снова.",
    ],
    [
      "the instance is starting",
      [stateIs("starting")],
      "Инстанс запускается. Попробуйте через минуту.",
    ],
    [
      "the instance is blocked",
      [stateIs("blocked")],
      "Инстанс заблокирован. Проверьте его в консоли GREEN-API.",
    ],
    [
      "the instance is suspended",
      [stateIs("suspended")],
      "Работа инстанса временно ограничена. Проверьте его в консоли GREEN-API.",
    ],
    [
      "the instance has a yellow card",
      [stateIs("yellowCard")],
      "Работа инстанса временно ограничена. Проверьте его в консоли GREEN-API.",
    ],
    [
      "GREEN-API fails",
      [status("getStateInstance", 500)],
      "Не удалось проверить инстанс. Попробуйте ещё раз.",
    ],
    [
      "the settings call is refused",
      [stateIs("authorized"), status("getSettings", 403)],
      "Неверный idInstance или apiTokenInstance.",
    ],
  ])("explains when %s", async (_situation, handlers, message) => {
    server.use(...handlers);
    const user = userEvent.setup();
    await openPage();

    await signIn(user);

    expect((await screen.findByRole("alert")).textContent).toContain(message);
    expect(field("idInstance").value).toBe("7103123456");
    expect(field("apiTokenInstance").value).toBe("faketoken");
    expect(
      screen.getByRole("button", { name: "Проверить снова" }),
    ).toBeDefined();
    expect(screen.queryByText("Инстанс 7103123456")).toBeNull();
  });

  // @regression — functional §2.2 c1 + §2.3 c1
  it("opens the main screen for a ready instance", async () => {
    server.use(...ready());
    const user = userEvent.setup();
    await openPage();

    await signIn(user);

    expect(await screen.findByText("Инстанс 7103123456")).toBeDefined();
    expect(screen.getByRole("button", { name: "Выйти" })).toBeDefined();
    expect(
      screen.getByText("Выберите чат, чтобы начать переписку"),
    ).toBeDefined();
    expect(requests).toEqual(["getStateInstance", "getSettings"]);
  });

  // @regression — functional §2.2 c2
  it("shows the wrong-credentials message and keeps what was typed", async () => {
    server.use(status("getStateInstance", 401));
    const user = userEvent.setup();
    await openPage();

    await signIn(user);

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Неверный idInstance или apiTokenInstance.",
    );
    expect(field("idInstance").value).toBe("7103123456");
    expect(field("apiTokenInstance").value).toBe("faketoken");
    expect(field("API URL").value).toBe("https://7103.api.greenapi.com");
  });

  // @regression — functional §2.2 c3
  it("names the API URL it could not reach", async () => {
    server.use(unreachable("getStateInstance"));
    const user = userEvent.setup();
    await openPage();
    await fillIn(user);
    await user.click(field("Указать API URL вручную"));
    await user.clear(field("API URL"));
    await user.type(field("API URL"), "https://other.example/");

    await user.click(signInButton());

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Не удалось связаться с https://other.example. Проверьте API URL в консоли GREEN-API и подключение к интернету.",
    );
  });

  // @regression — functional §2.2 c4
  it("lets the user in on «Проверить снова» once the instance is authorized", async () => {
    server.use(stateIs("notAuthorized"));
    const user = userEvent.setup();
    await openPage();
    await signIn(user);
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Инстанс не авторизован. Отсканируйте QR-код в консоли GREEN-API.",
    );

    server.use(...ready());
    await user.click(screen.getByRole("button", { name: "Проверить снова" }));

    expect(await screen.findByText("Инстанс 7103123456")).toBeDefined();
  });

  // @regression — functional §2.2 c5 (and the app never changes the settings itself)
  it.each([
    [
      { webhookUrl: "https://hook.example", incomingWebhook: "yes" },
      "Входящие сообщения уходят на webhook. Очистите поле Webhook URL в настройках инстанса в консоли GREEN-API.",
    ],
    [
      { webhookUrl: "", incomingWebhook: "no" },
      "Уведомления о входящих сообщениях выключены. Включите их в настройках инстанса в консоли GREEN-API.",
    ],
  ])("explains settings %j", async (settings, message) => {
    server.use(stateIs("authorized"), settingsAre(settings));
    const user = userEvent.setup();
    await openPage();

    await signIn(user);

    expect((await screen.findByRole("alert")).textContent).toContain(message);
    // Read-only: no setSettings or any other call to fix the instance.
    expect(requests).toEqual(["getStateInstance", "getSettings"]);
  });

  // @regression — functional §2.2 c6
  it("gives up after 15 seconds, keeps the input and offers «Проверить снова»", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    server.use(hang("getStateInstance"));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await openPage();
    await signIn(user);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(14_000);
    });
    expect(screen.queryByRole("alert")).toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Не удалось проверить инстанс. Попробуйте ещё раз.",
    );
    expect(field("idInstance").value).toBe("7103123456");
    expect(field("apiTokenInstance").value).toBe("faketoken");
    expect(
      screen.getByRole("button", { name: "Проверить снова" }),
    ).toBeDefined();
  });

  // @regression — functional §2.2 c7
  it("shows that it is working and checks exactly once however often «Войти» is pressed", async () => {
    const state = gated("getStateInstance", { stateInstance: "notAuthorized" });
    server.use(state.handler);
    const user = userEvent.setup();
    await openPage();
    await signIn(user);

    expect(signInButton().textContent).toBe("Проверяем…");
    expect(signInButton().disabled).toBe(true);
    expect(signInButton().getAttribute("aria-busy")).toBe("true");
    await user.click(signInButton());
    await user.type(field("apiTokenInstance"), "{Enter}");

    state.open();
    await screen.findByRole("alert");
    expect(requests).toEqual(["getStateInstance"]);
  });
});

describe("§2.4 remembered session", () => {
  // @regression — functional §2.4 c1
  it("re-checks the saved credentials on reload, then opens the main screen", async () => {
    const state = gated("getStateInstance", { stateInstance: "authorized" });
    server.use(
      state.handler,
      settingsAre({ webhookUrl: "", incomingWebhook: "yes" }),
    );
    saveSession(SAVED);

    await openPage();
    expect(screen.getByText("Проверяем инстанс…")).toBeDefined();

    state.open();
    expect(await screen.findByText("Инстанс 7103123456")).toBeDefined();
  });

  // @regression — functional §2.4: the user stays signed in in this browser
  it("remembers a sign-in made through the form", async () => {
    server.use(...ready());
    const user = userEvent.setup();
    await openPage();
    await signIn(user);
    await screen.findByText("Инстанс 7103123456");

    await openPage();

    expect(await screen.findByText("Инстанс 7103123456")).toBeDefined();
  });

  // @regression — functional §2.4 c2
  it("brings back the filled-in form with the reason when the saved instance is no longer ready", async () => {
    server.use(stateIs("notAuthorized"));
    saveSession({
      ...SAVED,
      apiUrl: "https://custom.example",
      customApiUrl: true,
    });

    await openPage();

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Инстанс не авторизован. Отсканируйте QR-код в консоли GREEN-API.",
    );
    expect(field("idInstance").value).toBe("7103123456");
    expect(field("apiTokenInstance").value).toBe("faketoken");
    expect(field("API URL").value).toBe("https://custom.example");
    expect(field("Указать API URL вручную").checked).toBe(true);
  });

  // @regression — functional §2.4: saved values that can't be read → empty form
  it.each([
    ["unreadable JSON", "{not json"],
    [
      "the wrong shape",
      JSON.stringify({
        state: { credentials: { idInstance: 42 } },
        version: 1,
      }),
    ],
  ])("shows the empty form for %s", async (_name, raw) => {
    localStorage.setItem(STORAGE_KEY, raw);

    await openPage();

    expect(field("idInstance").value).toBe("");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(requests).toEqual([]);
  });
});

describe("§2.5 logout", () => {
  // @regression — functional §2.5 c1
  it("empties the form on «Выйти» and keeps it after a reload", async () => {
    server.use(...ready());
    saveSession(SAVED);
    const user = userEvent.setup();
    await openPage();

    await user.click(await screen.findByRole("button", { name: "Выйти" }));

    expect(field("idInstance").value).toBe("");
    expect(field("apiTokenInstance").value).toBe("");
    expect(field("API URL").value).toBe("");
    expect(localStorage.getItem(STORAGE_KEY)).not.toContain("faketoken");

    requests.length = 0;
    await openPage();
    await waitFor(() => {
      expect(field("idInstance").value).toBe("");
    });
    expect(requests).toEqual([]);
  });
});

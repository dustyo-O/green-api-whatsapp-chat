// @layer: integration
// @spec: 003-chats-sending
import { act, fireEvent, screen, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";
import { formatTime } from "./time";
import {
  API_URL,
  posted,
  ready,
  reply,
  requests,
  sentAs,
  server,
  status,
  unreachable,
  whatsappExists,
  setupGreenApiServer,
} from "../test/green-api-server";

setupGreenApiServer();

const ID = "7103123456";
const CHATS_KEY = `green-api-chat:chats:${ID}`;
const RU = "79037474411@c.us";
const RS = "381629443720@c.us";

/** Opens (or reloads) the page signed in: fresh modules, then main.tsx as the browser runs it. */
async function openPage() {
  document.body.innerHTML = '<div id="root"></div>';
  vi.resetModules();
  await act(async () => {
    await import("../main");
  });
  await screen.findByText(`Инстанс ${ID}`);
}

function signedIn() {
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
  server.use(...ready());
}

function saveChats(chats: Record<string, unknown>) {
  localStorage.setItem(
    CHATS_KEY,
    JSON.stringify({ state: { chats }, version: 1 }),
  );
}

/** A `checkWhatsapp` that answers `existsWhatsapp: true` only once `open()` is called. */
function gatedCheck() {
  let open = () => {};
  const gate = new Promise<void>((resolve) => {
    open = resolve;
  });
  return {
    handler: reply("checkWhatsapp", async () => {
      await gate;
      return HttpResponse.json({ existsWhatsapp: true });
    }),
    open: () => {
      open();
    },
  };
}

const plus = () => screen.getByRole("button", { name: "Новый чат" });
const picker = () =>
  screen.getByRole<HTMLSelectElement>("combobox", { name: "Страна" });
const numberField = () =>
  screen.getByRole<HTMLInputElement>("textbox", { name: "Номер телефона" });
const startButton = () =>
  screen.getByRole<HTMLButtonElement>("button", {
    name: /Начать чат|Проверяем…/,
  });
const chatList = () => screen.getByRole("list", { name: "Чаты" });
const titles = () =>
  within(chatList())
    .getAllByRole("button")
    .map((b) => b.firstChild?.textContent);
const conversationTitle = () => screen.queryByRole("heading", { level: 2 });

async function startChat(user: UserEvent, number: string) {
  await user.click(plus());
  await user.type(numberField(), number);
  await user.click(startButton());
}

/** A `sendMessage` that answers `idMessage` only once `open()` is called. */
function gatedSend() {
  let open = () => {};
  const gate = new Promise<void>((resolve) => {
    open = resolve;
  });
  return {
    handler: reply("sendMessage", async () => {
      await gate;
      return HttpResponse.json({ idMessage: "BAE5" });
    }),
    open: () => {
      open();
    },
  };
}

const composer = () =>
  screen.getByPlaceholderText<HTMLTextAreaElement>("Введите сообщение");
const bubbles = () =>
  within(screen.getByRole("list", { name: "Сообщения" })).queryAllByRole(
    "listitem",
  );
const bubbleTexts = () => bubbles().map((b) => b.textContent);
/** Clicks the chat whose title is `title` (its button also holds the time and the preview). */
const openChat = (user: UserEvent, title: string) => {
  const button = within(chatList())
    .getAllByRole("button")
    .find((b) => b.firstChild?.textContent === title);
  if (button === undefined) throw new Error(`no chat ${title}`);
  return user.click(button);
};
const NOW = new Date(2026, 9, 6, 14, 7).getTime();

/** Signed in with an empty `+7 903 747-44-11` chat (and an older `+381…` one), the first one open. */
async function openRuChat(user: UserEvent) {
  signedIn();
  saveChats({
    [RS]: { id: RS, createdAt: 1_000, messages: [], draft: "" },
    [RU]: { id: RU, createdAt: 2_000, messages: [], draft: "" },
  });
  await openPage();
  await openChat(user, "+7 903 747-44-11");
}

afterEach(() => {
  document.body.innerHTML = "";
  localStorage.clear();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("§2.1 starting a chat", () => {
  // @regression — functional §2.1 c1
  it("opens a row with Россия +7, an empty number and «Начать чат» on «+»", async () => {
    signedIn();
    const user = userEvent.setup();
    await openPage();

    await user.click(plus());

    expect(picker().selectedOptions[0].textContent).toBe("🇷🇺 Россия +7");
    expect(numberField().value).toBe("");
    expect(startButton().textContent).toBe("Начать чат");
    expect(startButton().disabled).toBe(true);
  });

  // @regression — functional §2.1 c2
  it("checks the number, then adds the chat at the top and opens it", async () => {
    signedIn();
    saveChats({
      [RS]: { id: RS, createdAt: 1_000, messages: [], draft: "" },
    });
    server.use(whatsappExists(true));
    const user = userEvent.setup();
    await openPage();

    await startChat(user, "903 747-44-11");

    expect((await screen.findByRole("heading", { level: 2 })).textContent).toBe(
      "+7 903 747-44-11",
    );
    expect(titles()).toEqual(["+7 903 747-44-11", "+381629443720"]);
    expect(
      within(chatList()).getByRole("button", { current: true }).textContent,
    ).toContain("+7 903 747-44-11");
    expect(posted).toEqual([
      {
        method: "checkWhatsapp",
        contentType: "application/json",
        body: { chatId: RU },
      },
    ]);
    // The row closes once the chat opens.
    expect(
      screen.queryByRole("textbox", { name: "Номер телефона" }),
    ).toBeNull();
  });

  // @regression — functional §2.1 c3, c4, c5
  it.each([
    [
      "no WhatsApp",
      whatsappExists(false),
      "903 747-44-11",
      "На этом номере нет WhatsApp",
    ],
    [
      "an invalid number",
      reply("checkWhatsapp", () =>
        HttpResponse.json(
          {
            statusCode: 400,
            message:
              "Validation failed. Details: 'chatId' must be one of the next formats: 'phone_number@c.us' or 'chat_id@lid'",
          },
          { status: 400 },
        ),
      ),
      "123",
      "Неверный номер. Проверьте код страны и номер.",
    ],
    [
      "a failed check",
      status("checkWhatsapp", 500),
      "903 747-44-11",
      "Не удалось проверить номер. Попробуйте ещё раз.",
    ],
  ])(
    "creates no chat for %s and keeps the number",
    async (_, handler, number, text) => {
      signedIn();
      server.use(handler);
      const user = userEvent.setup();
      await openPage();

      await startChat(user, number);

      expect((await screen.findByRole("alert")).textContent).toBe(text);
      expect(numberField().value).toBe(number);
      expect(
        screen.getByText("Нет чатов. Нажмите «+», чтобы начать"),
      ).toBeDefined();
      expect(conversationTitle()).toBeNull();
      expect(localStorage.getItem(CHATS_KEY)).not.toContain("@c.us");
    },
  );

  // @regression — functional §2.1 c6
  it("opens an existing chat without checking it again", async () => {
    signedIn();
    saveChats({
      [RU]: { id: RU, createdAt: 1_000, messages: [], draft: "" },
      [RS]: { id: RS, createdAt: 2_000, messages: [], draft: "" },
    });
    const user = userEvent.setup();
    await openPage();
    requests.length = 0;

    await startChat(user, "(903) 7474411");

    expect(conversationTitle()?.textContent).toBe("+7 903 747-44-11");
    expect(titles()).toEqual(["+381629443720", "+7 903 747-44-11"]);
    expect(requests).toEqual([]);
  });

  // @regression — functional §2.1 c7
  it("starts a chat with a typed country code for «Другая страна»", async () => {
    signedIn();
    server.use(whatsappExists(true));
    const user = userEvent.setup();
    await openPage();
    await user.click(plus());

    await user.selectOptions(picker(), "Другая страна");
    expect(startButton().disabled).toBe(true);
    await user.type(numberField(), "629443720");
    expect(startButton().disabled).toBe(true);
    await user.type(screen.getByRole("textbox", { name: "Код страны" }), "381");
    await user.click(startButton());

    expect((await screen.findByRole("heading", { level: 2 })).textContent).toBe(
      "+381629443720",
    );
    expect(posted[0].body).toEqual({ chatId: RS });
  });

  it("uses the picked country's code", async () => {
    signedIn();
    server.use(whatsappExists(true));
    const user = userEvent.setup();
    await openPage();
    await user.click(plus());

    await user.selectOptions(picker(), "🇷🇸 Сербия +381");
    await user.type(numberField(), "629443720{Enter}");

    expect((await screen.findByRole("heading", { level: 2 })).textContent).toBe(
      "+381629443720",
    );
  });

  // @regression — functional §2.1 c8
  it("keeps «Начать чат» inactive for letters, and «Другая страна» needs a digits-only code", async () => {
    signedIn();
    const user = userEvent.setup();
    await openPage();
    await user.click(plus());

    await user.type(numberField(), "903abc");
    expect(startButton().disabled).toBe(true);
    await user.keyboard("{Enter}");

    await user.clear(numberField());
    await user.type(numberField(), "903");
    expect(startButton().disabled).toBe(false);

    await user.selectOptions(picker(), "Другая страна");
    await user.type(
      screen.getByRole("textbox", { name: "Код страны" }),
      "+381",
    );
    expect(startButton().disabled).toBe(true);
    expect(requests).not.toContain("checkWhatsapp");
  });

  // @regression — functional §2.1: Enter in the number field = «Начать чат»
  it("starts the chat on Enter in the number field", async () => {
    signedIn();
    server.use(whatsappExists(true));
    const user = userEvent.setup();
    await openPage();
    await user.click(plus());

    await user.type(numberField(), "9037474411{Enter}");

    expect((await screen.findByRole("heading", { level: 2 })).textContent).toBe(
      "+7 903 747-44-11",
    );
  });

  // @regression — functional §2.1 c9
  it("locks the row while checking, with «Проверяем…»", async () => {
    signedIn();
    const check = gatedCheck();
    server.use(check.handler);
    const user = userEvent.setup();
    await openPage();

    await startChat(user, "903 747-44-11");
    expect(startButton().textContent).toBe("Проверяем…");

    await user.type(numberField(), "99");
    await user.click(startButton());
    await user.keyboard("{Enter}");
    expect(numberField().value).toBe("903 747-44-11");
    expect(picker().matches(":disabled")).toBe(true);
    expect(startButton().disabled).toBe(true);
    expect(posted).toHaveLength(1);

    check.open();
    expect((await screen.findByRole("heading", { level: 2 })).textContent).toBe(
      "+7 903 747-44-11",
    );
  });

  // @regression — tech §2.6: an answer that arrives after logout and another sign-in is dropped
  it("drops a check answer that arrives after logout and another sign-in", async () => {
    signedIn();
    const check = gatedCheck();
    server.use(check.handler);
    const user = userEvent.setup();
    await openPage();
    await startChat(user, "903 747-44-11");

    await user.click(screen.getByRole("button", { name: "Выйти" }));
    await user.type(screen.getByLabelText("idInstance"), "7103999999");
    await user.type(screen.getByLabelText("apiTokenInstance"), "faketoken");
    await user.click(screen.getByRole("button", { name: "Войти" }));
    await screen.findByText("Инстанс 7103999999");
    await act(async () => {
      check.open();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(
      screen.getByText("Нет чатов. Нажмите «+», чтобы начать"),
    ).toBeDefined();
    expect(localStorage.getItem(CHATS_KEY)).toBeNull();
    expect(
      localStorage.getItem("green-api-chat:chats:7103999999"),
    ).not.toContain(RU);
  });
});

describe("§2.2 chat list", () => {
  // @regression — functional §2.2 c2
  it("says there are no chats, and the right area asks to pick one", async () => {
    signedIn();
    await openPage();

    expect(
      screen.getByText("Нет чатов. Нажмите «+», чтобы начать"),
    ).toBeDefined();
    expect(
      screen.getByText("Выберите чат, чтобы начать переписку"),
    ).toBeDefined();
  });

  // @regression — functional §2.2: number, last message, its time; newest first
  it("shows each chat's title, last message and time, newest first", async () => {
    signedIn();
    const at = (h: number, m: number) => new Date(2026, 9, 6, h, m).getTime();
    saveChats({
      [RU]: {
        id: RU,
        createdAt: at(9, 0),
        messages: [
          {
            id: "m1",
            direction: "out",
            text: "Первое",
            time: at(9, 5),
            status: "sent",
          },
          {
            id: "m2",
            direction: "out",
            text: "Привет\nвторая строка",
            time: at(14, 7),
            status: "sent",
          },
        ],
        draft: "",
      },
      [RS]: { id: RS, createdAt: at(10, 0), messages: [], draft: "" },
    });
    await openPage();

    const [first, second] = within(chatList()).getAllByRole("button");
    expect(first.textContent).toBe(
      "+7 903 747-44-1114:07Привет\nвторая строка",
    );
    expect(second.textContent).toBe("+381629443720");
  });

  // @regression — functional §2.2: clicking a chat opens and highlights it
  it("opens the clicked chat and highlights it", async () => {
    signedIn();
    saveChats({
      [RU]: { id: RU, createdAt: 1_000, messages: [], draft: "" },
      [RS]: { id: RS, createdAt: 2_000, messages: [], draft: "" },
    });
    const user = userEvent.setup();
    await openPage();
    expect(
      within(chatList()).queryByRole("button", { current: true }),
    ).toBeNull();

    await user.click(
      within(chatList()).getByRole("button", { name: "+7 903 747-44-11" }),
    );

    expect(conversationTitle()?.textContent).toBe("+7 903 747-44-11");
    expect(
      within(chatList()).getByRole("button", { current: true }).textContent,
    ).toBe("+7 903 747-44-11");
    expect(
      screen.queryByText("Выберите чат, чтобы начать переписку"),
    ).toBeNull();
  });
  // @regression — functional §2.2 c1
  it("moves a chat to the top with its message and time when the user sends in it", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    signedIn();
    saveChats({
      [RU]: { id: RU, createdAt: 1_000, messages: [], draft: "" },
      [RS]: { id: RS, createdAt: 2_000, messages: [], draft: "" },
    });
    server.use(sentAs("BAE5"));
    const user = userEvent.setup();
    await openPage();
    expect(titles()).toEqual(["+381629443720", "+7 903 747-44-11"]);

    await openChat(user, "+7 903 747-44-11");
    await user.type(composer(), "Привет{Enter}");

    expect(titles()).toEqual(["+7 903 747-44-11", "+381629443720"]);
    expect(within(chatList()).getAllByRole("button")[0].textContent).toBe(
      `+7 903 747-44-11${formatTime(NOW)}Привет`,
    );
  });
});

describe("§2.3 conversation and sending", () => {
  // @regression — functional §2.3 c1
  it("shows «Привет» with the time and 🕓, then ✅, and empties the box", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    const send = gatedSend();
    server.use(send.handler);
    const user = userEvent.setup();
    await openRuChat(user);
    expect(composer().placeholder).toBe("Введите сообщение");

    await user.type(composer(), "Привет{Enter}");

    expect(bubbleTexts()).toEqual([`Привет${formatTime(NOW)} 🕓`]);
    expect(composer().value).toBe("");
    expect(posted).toEqual([
      {
        method: "sendMessage",
        contentType: "application/json",
        body: { chatId: RU, message: "Привет" },
      },
    ]);

    send.open();
    expect(await screen.findByText(/✅/)).toBe(bubbles()[0].children[1]);
    expect(bubbleTexts()).toEqual([`Привет${formatTime(NOW)} ✅`]);
  });

  // @regression — functional §2.3 c2
  it("shows ❗ «Не отправлено · Повторить» when refused, and ✅ on the same bubble after a retry", async () => {
    server.use(status("sendMessage", 466));
    const user = userEvent.setup();
    await openRuChat(user);

    await user.type(composer(), "Привет{Enter}");
    await screen.findByText(/❗/);
    expect(bubbles()[0].textContent).toMatch(/❗Не отправлено · Повторить$/);

    server.use(sentAs("BAE5"));
    await user.click(screen.getByRole("button", { name: "Повторить" }));

    await screen.findByText(/✅/);
    expect(bubbles()).toHaveLength(1);
    expect(bubbles()[0].textContent).toMatch(/^Привет\d\d:\d\d ✅$/);
    expect(posted.map((p) => p.body)).toEqual([
      { chatId: RU, message: "Привет" },
      { chatId: RU, message: "Привет" },
    ]);
  });

  // @regression — functional §2.3 c3
  it("shows ❔ «Статус неизвестен · Повторить» and asks before sending again", async () => {
    server.use(unreachable("sendMessage"));
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const user = userEvent.setup();
    await openRuChat(user);

    await user.type(composer(), "Привет{Enter}");
    await screen.findByText(/❔/);
    expect(bubbles()[0].textContent).toMatch(
      /❔Статус неизвестен · Повторить$/,
    );

    await user.click(screen.getByRole("button", { name: "Повторить" }));
    expect(confirm).toHaveBeenCalledExactlyOnceWith(
      "Сообщение могло уже уйти. Отправить ещё раз?",
    );
    expect(posted).toHaveLength(1);
    expect(bubbles()[0].textContent).toContain("❔");

    confirm.mockReturnValue(true);
    server.use(sentAs("BAE5"));
    await user.click(screen.getByRole("button", { name: "Повторить" }));

    await screen.findByText(/✅/);
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(posted).toHaveLength(2);
    expect(bubbles()).toHaveLength(1);
  });

  it("retries a refused message without asking", async () => {
    server.use(status("sendMessage", 400));
    const confirm = vi.spyOn(window, "confirm");
    const user = userEvent.setup();
    await openRuChat(user);
    await user.type(composer(), "Привет{Enter}");
    await screen.findByText(/❗/);

    await user.click(screen.getByRole("button", { name: "Повторить" }));

    expect(confirm).not.toHaveBeenCalled();
    expect(posted).toHaveLength(2);
  });

  // @regression — functional §2.3 c4
  it("sends two lines joined by Shift+Enter as one bubble", async () => {
    server.use(sentAs("BAE5"));
    const user = userEvent.setup();
    await openRuChat(user);

    await user.type(composer(), "Первая{Shift>}{Enter}{/Shift}Вторая{Enter}");

    expect(bubbles()).toHaveLength(1);
    expect(bubbles()[0].firstChild?.textContent).toBe("Первая\nВторая");
    expect(posted[0].body).toEqual({ chatId: RU, message: "Первая\nВторая" });
  });

  // @regression — functional §2.3 c5
  it("sends nothing for an empty box or one with only spaces", async () => {
    const user = userEvent.setup();
    await openRuChat(user);

    await user.type(composer(), "{Enter}");
    await user.type(composer(), "   {Enter}");

    expect(bubbles()).toEqual([]);
    expect(requests).not.toContain("sendMessage");
    expect(composer().value).toBe("   ");
  });

  // @regression — tech §2.6: trim only tests emptiness
  it("sends the text exactly as typed, spaces included", async () => {
    server.use(sentAs("BAE5"));
    const user = userEvent.setup();
    await openRuChat(user);

    await user.type(composer(), "  Привет {Enter}");

    expect(posted[0].body).toEqual({ chatId: RU, message: "  Привет " });
  });

  // @regression — tech §3 risk 5: Enter while an IME is composing confirms the word
  it("does not send on Enter while an IME is composing", async () => {
    const user = userEvent.setup();
    await openRuChat(user);
    await user.type(composer(), "Привет");

    fireEvent.keyDown(composer(), { key: "Enter", isComposing: true });

    expect(bubbles()).toEqual([]);
    expect(composer().value).toBe("Привет");
  });

  // @regression — functional §2.3 c7
  it("keeps only the first 20 000 characters of a longer paste", async () => {
    const user = userEvent.setup();
    await openRuChat(user);

    await user.click(composer());
    await user.paste("я".repeat(20_001));

    expect(composer().value).toHaveLength(20_000);
  });
});

describe("§2.4 chats kept across reloads", () => {
  // @regression — functional §2.4 c1
  it("keeps both chats and all their messages with their marks", async () => {
    signedIn();
    saveChats({
      [RS]: { id: RS, createdAt: 1_000, messages: [], draft: "" },
      [RU]: { id: RU, createdAt: 2_000, messages: [], draft: "" },
    });
    server.use(sentAs("BAE5"));
    const user = userEvent.setup();
    await openPage();
    await openChat(user, "+7 903 747-44-11");
    await user.type(composer(), "Привет{Enter}");
    await screen.findByText(/✅/);
    server.use(status("sendMessage", 466));
    await openChat(user, "+381629443720");
    await user.type(composer(), "Здравствуйте{Enter}");
    await screen.findByText(/❗/);

    await openPage();

    expect(titles()).toEqual(["+381629443720", "+7 903 747-44-11"]);
    await openChat(user, "+381629443720");
    expect(bubbleTexts()).toEqual([
      expect.stringMatching(
        /^Здравствуйте\d\d:\d\d ❗Не отправлено · Повторить$/,
      ),
    ]);
    await openChat(user, "+7 903 747-44-11");
    expect(bubbleTexts()).toEqual([
      expect.stringMatching(/^Привет\d\d:\d\d ✅$/),
    ]);
  });

  // @regression — functional §2.4 c2
  it("shows ❔ for a message that was still 🕓 when the page closed, and doesn't resend it", async () => {
    signedIn();
    saveChats({
      [RU]: {
        id: RU,
        createdAt: 1_000,
        messages: [
          {
            id: "m1",
            direction: "out",
            text: "Привет",
            time: NOW,
            status: "sending",
          },
        ],
        draft: "",
      },
    });
    const user = userEvent.setup();
    await openPage();

    await openChat(user, "+7 903 747-44-11");

    expect(bubbleTexts()).toEqual([
      `Привет${formatTime(NOW)} ❔Статус неизвестен · Повторить`,
    ]);
    expect(requests).not.toContain("sendMessage");
  });

  // @regression — functional §2.4 c3
  it("keeps chat A's draft across a chat switch and a reload", async () => {
    const user = userEvent.setup();
    await openRuChat(user);

    await user.type(composer(), "черновик");
    await openChat(user, "+381629443720");
    expect(composer().value).toBe("");
    await openChat(user, "+7 903 747-44-11");
    expect(composer().value).toBe("черновик");

    await openPage();
    await openChat(user, "+7 903 747-44-11");

    expect(composer().value).toBe("черновик");
    expect(requests).not.toContain("sendMessage");
  });

  // @regression — functional §2.4: started chats survive a reload, none selected
  it("keeps started chats after a reload", async () => {
    signedIn();
    server.use(whatsappExists(true));
    const user = userEvent.setup();
    await openPage();
    await startChat(user, "903 747-44-11");
    await screen.findByRole("heading", { level: 2 });

    await openPage();

    expect(titles()).toEqual(["+7 903 747-44-11"]);
    expect(
      screen.getByText("Выберите чат, чтобы начать переписку"),
    ).toBeDefined();
  });

  // @regression — functional §2.4 c4
  it("forgets every chat on «Выйти»", async () => {
    signedIn();
    saveChats({ [RU]: { id: RU, createdAt: 1_000, messages: [], draft: "" } });
    const user = userEvent.setup();
    await openPage();

    await user.click(screen.getByRole("button", { name: "Выйти" }));
    await user.type(screen.getByLabelText("idInstance"), ID);
    await user.type(screen.getByLabelText("apiTokenInstance"), "faketoken");
    await user.click(screen.getByRole("button", { name: "Войти" }));

    expect(
      await screen.findByText("Нет чатов. Нажмите «+», чтобы начать"),
    ).toBeDefined();
    expect(localStorage.getItem(CHATS_KEY)).not.toContain(RU);
  });
});

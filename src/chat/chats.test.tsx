// @layer: integration
// @spec: 003-chats-sending
import { act, screen, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  API_URL,
  posted,
  ready,
  reply,
  requests,
  server,
  status,
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
const chatList = () => screen.getByRole("list");
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

afterEach(() => {
  document.body.innerHTML = "";
  localStorage.clear();
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
});

describe("§2.4 chats kept across reloads", () => {
  // @regression — functional §2.4 c1 (chats only; messages come with slice 3)
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

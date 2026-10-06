// @layer: integration
// @spec: 004-receiving-replies
import { act, screen, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import type { Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  API_URL,
  deleted,
  failure,
  posted,
  queue,
  ready,
  received,
  sentAs,
  server,
  setupGreenApiServer,
} from "../test/green-api-server";
import {
  groupMessage,
  lidWithName,
  lidWithoutName,
  outgoingMessageReceived,
  reactionMessage,
  stickerMessage,
  textBody,
  webhook,
} from "./notification.fixtures";
import { formatTime } from "./time";

setupGreenApiServer();

const ID = "7103123456";
const CHATS_KEY = `green-api-chat:chats:${ID}`;
const RU = "79037474411@c.us";
const RS = "381629443720@c.us";
const PLACEHOLDER = "Сообщение этого типа пока не поддерживается";

/** Local time today, in ms. */
const at = (hours: number, minutes: number) =>
  new Date(2026, 9, 6, hours, minutes).getTime();

let receipts = 0;
let ids = 0;

/** A queued text reply from `chatId`, sent at `time` (ms), with a fresh `idMessage`. */
function reply(
  text: string,
  { chatId = RU, time = Date.now(), idMessage = `ID${String(++ids)}` } = {},
) {
  return {
    receiptId: ++receipts,
    body: textBody(text, {
      chatId,
      idMessage,
      timestamp: Math.floor(time / 1000),
    }),
  };
}

const notification = (body: unknown) => ({ receiptId: ++receipts, body });

// main.tsx owns its root; the helper keeps it so a reload unmounts the previous page, whose
// receive loop would otherwise keep running (and wake up on `online` or failing answers).
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

/** Opens (or reloads) the page: fresh modules, then main.tsx as the browser runs it. */
async function loadPage() {
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
}

async function openPage() {
  await loadPage();
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

const chat = (id: string, createdAt: number, messages: unknown[] = []) => ({
  id,
  createdAt,
  messages,
  draft: "",
});

const sent = (text: string, time: number) => ({
  id: `out-${text}`,
  direction: "out",
  text,
  time,
  status: "sent",
  idMessage: `OUT-${text}`,
});

const chatList = () => screen.getByRole("list", { name: "Чаты" });
const rows = () => within(chatList()).getAllByRole("button");
const titles = () => rows().map((b) => b.firstChild?.textContent);
const row = (title: string) => {
  const button = rows().find((b) => b.firstChild?.textContent === title);
  if (button === undefined) throw new Error(`no chat ${title}`);
  return button;
};
const badge = (title: string) =>
  within(row(title)).queryByLabelText(/непрочитанных$/);
const messageList = () => screen.getByRole("list", { name: "Сообщения" });
const bubbles = () => within(messageList()).queryAllByRole("listitem");
const bubbleTexts = () => bubbles().map((b) => b.textContent);
const heading = () => screen.getByRole("heading", { level: 2 }).textContent;

// jsdom applies no CSS: the CSS-module class (`_in_<hash>`) stands for the left, white bubble.
const hasClass = (element: HTMLElement, name: string) =>
  [...element.classList].some((c) => c.startsWith(`_${name}_`));
const isIncoming = (bubble: HTMLElement) => hasClass(bubble, "in");

/** Signed in with a `+7 903 747-44-11` chat open (and an older `+381…` one). */
async function openRuChat(user: UserEvent, messages: unknown[] = []) {
  signedIn();
  saveChats({ [RS]: chat(RS, 1_000), [RU]: chat(RU, 2_000, messages) });
  await openPage();
  await user.click(row("+7 903 747-44-11"));
}

afterEach(() => {
  unmount();
  document.body.innerHTML = "";
  localStorage.clear();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.doUnmock("react-dom/client");
});

describe("§2.1 replies appear in the chat", () => {
  // @regression — functional §2.1 c1
  it("shows a reply in the open chat as a left bubble with its time, below the earlier messages", async () => {
    const user = userEvent.setup();
    await openRuChat(user, [sent("Привет", at(10, 0))]);

    const answer = reply("Привет-привет");
    queue(answer);

    const bubble = await within(messageList()).findByText("Привет-привет");
    const item = bubble.closest("li");
    if (item === null) throw new Error("no bubble");
    expect(bubbleTexts()).toEqual([
      `Привет${formatTime(at(10, 0))} ✅`,
      `Привет-привет${formatTime(answer.body.timestamp * 1000)} `,
    ]);
    expect(isIncoming(item)).toBe(true);
    expect(isIncoming(bubbles()[0])).toBe(false);
    expect(within(item).queryByRole("button")).toBeNull();
  });

  // @regression — functional §2.1 c2
  it("orders the user's 10:00 message above the contact's 10:01 reply", async () => {
    const user = userEvent.setup();
    await openRuChat(user, [
      sent("Привет", at(10, 0)),
      sent("Как дела?", at(10, 2)),
    ]);

    queue(reply("Привет-привет", { time: at(10, 1) }));

    await within(messageList()).findByText("Привет-привет");
    expect(bubbles().map((b) => b.firstChild?.textContent)).toEqual([
      "Привет",
      "Привет-привет",
      "Как дела?",
    ]);
  });

  // @regression — functional §2.1 c3
  it("keeps the newest message in view when a reply arrives", async () => {
    // jsdom has no layout: every bubble is 100 px high.
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(
      function (this: HTMLElement) {
        return this.children.length * 100;
      },
    );
    const user = userEvent.setup();
    await openRuChat(user, [sent("Привет", at(10, 0))]);
    expect(messageList().scrollTop).toBe(100);

    queue(reply("Привет-привет"));

    await within(messageList()).findByText("Привет-привет");
    expect(messageList().scrollTop).toBe(200);
  });
});

describe("§2.2 replies in other chats and from new contacts", () => {
  // @regression — functional §2.2 c1
  it("moves chat B to the top with its last reply and a badge «2», cleared on opening", async () => {
    const user = userEvent.setup();
    signedIn();
    saveChats({
      [RS]: chat(RS, 1_000, [sent("Здравствуйте", at(9, 0))]),
      [RU]: chat(RU, 2_000, [sent("Привет", at(10, 0))]),
    });
    await openPage();
    await user.click(row("+7 903 747-44-11"));
    expect(titles()).toEqual(["+7 903 747-44-11", "+381629443720"]);

    queue(
      reply("Добрый день", { chatId: RS }),
      reply("Как вы?", { chatId: RS }),
    );

    await vi.waitFor(() => {
      expect(badge("+381629443720")?.textContent).toBe("2");
    });
    expect(badge("+381629443720")?.getAttribute("aria-label")).toBe(
      "2 непрочитанных",
    );
    expect(titles()).toEqual(["+381629443720", "+7 903 747-44-11"]);
    expect(row("+381629443720").textContent).toContain("Как вы?");
    expect(badge("+7 903 747-44-11")).toBeNull();

    await user.click(row("+381629443720"));

    expect(heading()).toBe("+381629443720");
    expect(badge("+381629443720")).toBeNull();
  });

  // @regression — functional §2.2 c2
  it("adds a chat for a new number at the top with its reply and a badge «1»", async () => {
    signedIn();
    saveChats({ [RS]: chat(RS, 1_000), [RU]: chat(RU, 2_000) });
    await openPage();

    queue(reply("Здравствуйте", { chatId: "77011234567@c.us" }));

    await vi.waitFor(() => {
      expect(titles()).toEqual([
        "+7 701 123-45-67",
        "+7 903 747-44-11",
        "+381629443720",
      ]);
    });
    expect(row("+7 701 123-45-67").textContent).toContain("Здравствуйте");
    expect(badge("+7 701 123-45-67")?.textContent).toBe("1");
  });

  // @regression — functional §2.2 c3, c4
  it.each([
    ["the WhatsApp name «Иван»", lidWithName, "Иван"],
    ["«Неизвестный номер» without a name", lidWithoutName, "Неизвестный номер"],
  ])("titles a reply without the number with %s", async (_, body, title) => {
    signedIn();
    await openPage();

    queue(notification(body));

    await vi.waitFor(() => {
      expect(titles()).toEqual([title]);
    });
    expect(row(title).textContent).toContain("Привет");
    const user = userEvent.setup();
    await user.click(row(title));
    expect(heading()).toBe(title);
  });

  // @regression — functional §2.2 c5
  it("keeps two hidden senders without a name apart, and the first one's next reply in its chat", async () => {
    signedIn();
    await openPage();
    const hidden = (text: string, chatId: string, time: number) =>
      notification(
        textBody(text, {
          chatId,
          idMessage: `ID-${text}`,
          timestamp: time / 1000,
          senderData: { senderName: "", senderContactName: "", chatName: "" },
        }),
      );

    queue(
      hidden("Первый", "155508384256028@lid", at(10, 0)),
      hidden("Второй", "155508384256029@lid", at(10, 1)),
    );
    await vi.waitFor(() => {
      expect(titles()).toEqual(["Неизвестный номер", "Неизвестный номер"]);
    });
    queue(hidden("Снова первый", "155508384256028@lid", at(10, 2)));

    await vi.waitFor(() => {
      expect(rows()[0].textContent).toContain("Снова первый");
    });
    expect(rows()[1].textContent).toContain("Второй");
    expect(
      rows().map((r) => within(r).getByLabelText(/непрочитанных$/).textContent),
    ).toEqual(["2", "1"]);
    const user = userEvent.setup();
    await user.click(rows()[0]);
    expect(bubbles().map((b) => b.firstChild?.textContent)).toEqual([
      "Первый",
      "Снова первый",
    ]);
  });

  // @regression — functional §2.2 c6
  it("gives a late 09:00 reply to B a badge, but keeps B below A with its 10:00 preview", async () => {
    signedIn();
    saveChats({
      [RS]: chat(RS, 1_000, [sent("Как дела?", at(10, 0))]),
      [RU]: chat(RU, 2_000, [sent("Привет", at(11, 0))]),
    });
    await openPage();

    queue(reply("Опоздавший", { chatId: RS, time: at(9, 0) }));

    await vi.waitFor(() => {
      expect(badge("+381629443720")?.textContent).toBe("1");
    });
    expect(titles()).toEqual(["+7 903 747-44-11", "+381629443720"]);
    expect(row("+381629443720").textContent).toContain("Как дела?");
    expect(row("+381629443720").textContent).toContain(formatTime(at(10, 0)));
  });
});

describe("§2.3 messages the app can't display", () => {
  // @regression — functional §2.3 c1
  it("shows a sticker as the placeholder bubble on the left with its time", async () => {
    const user = userEvent.setup();
    await openRuChat(user);

    queue(notification(stickerMessage));

    const text = await within(messageList()).findByText(PLACEHOLDER);
    const item = text.closest("li");
    if (item === null) throw new Error("no bubble");
    expect(item.textContent).toBe(
      `${PLACEHOLDER}${formatTime(stickerMessage.timestamp * 1000)} `,
    );
    expect(isIncoming(item)).toBe(true);
    expect(hasClass(text, "unsupported")).toBe(true);
    expect(row("+7 903 747-44-11").textContent).toContain(PLACEHOLDER);
  });

  // @regression — functional §2.3 c2
  it("shows nothing for a group message, and later replies still appear", async () => {
    signedIn();
    saveChats({ [RU]: chat(RU, 2_000) });
    await openPage();

    queue(notification(groupMessage), reply("Текст"));

    await vi.waitFor(() => {
      expect(row("+7 903 747-44-11").textContent).toContain("Текст");
    });
    expect(titles()).toEqual(["+7 903 747-44-11"]);
    expect(screen.queryByText("Всем привет")).toBeNull();
  });

  // @regression — functional §2.3 c3
  it("doesn't show a message typed on the instance's own phone", async () => {
    signedIn();
    saveChats({ [RU]: chat(RU, 2_000) });
    await openPage();

    queue(notification(outgoingMessageReceived), reply("Ответ"));

    await vi.waitFor(() => {
      expect(row("+7 903 747-44-11").textContent).toContain("Ответ");
    });
    expect(screen.queryByText(/С телефона/)).toBeNull();
    const user = userEvent.setup();
    await user.click(row("+7 903 747-44-11"));
    expect(bubbles().map((b) => b.firstChild?.textContent)).toEqual(["Ответ"]);
  });
});

describe("§2.4 no reply is lost or shown twice", () => {
  // @regression — functional §2.4 c1
  it("shows each reply exactly once and in order after a reload", async () => {
    const user = userEvent.setup();
    await openRuChat(user);
    const first = reply("Раз", { time: at(10, 0) });
    queue(
      first,
      reply("Два", { time: at(10, 1) }),
      reply("Три", { time: at(10, 2) }),
    );
    await within(messageList()).findByText("Три");

    await openPage();
    // The first reply comes again after the reload (an undeleted head).
    queue({ ...first, receiptId: ++receipts });
    await vi.waitFor(() => {
      expect(received.length).toBeGreaterThan(4);
    });
    await user.click(row("+7 903 747-44-11"));

    expect(bubbles().map((b) => b.firstChild?.textContent)).toEqual([
      "Раз",
      "Два",
      "Три",
    ]);
  });

  // @regression — functional §2.4 c2
  it("shows a reply sent while the app was closed after sign-in, with the time it was sent", async () => {
    saveChats({ [RU]: chat(RU, 2_000, [sent("Привет", at(9, 0))]) });
    queue(reply("Ты тут?", { time: at(9, 30) }));
    server.use(...ready());
    await loadPage();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText("idInstance"), ID);
    await user.type(screen.getByLabelText("apiTokenInstance"), "faketoken");
    await user.click(screen.getByRole("button", { name: "Войти" }));

    await vi.waitFor(() => {
      expect(row("+7 903 747-44-11").textContent).toContain("Ты тут?");
    });
    await user.click(row("+7 903 747-44-11"));
    expect(bubbleTexts().at(-1)).toBe(`Ты тут?${formatTime(at(9, 30))} `);
  });

  // @regression — functional §2.4 c3
  it("shows a reply delivered twice once", async () => {
    const user = userEvent.setup();
    await openRuChat(user);
    const twice = reply("Привет-привет");

    queue(twice, { ...twice, receiptId: ++receipts }, reply("Потом"));

    await within(messageList()).findByText("Потом");
    expect(bubbles().map((b) => b.firstChild?.textContent)).toEqual([
      "Привет-привет",
      "Потом",
    ]);
  });

  // @regression — functional §2.4 c4
  it("shows «Я тут» within 10 s once a 30 s outage is over, without a reload", async () => {
    vi.useFakeTimers({
      toFake: ["setTimeout", "clearTimeout"],
      shouldAdvanceTime: true,
    });
    let offline = true;
    server.use(
      http.get("*/receiveNotification/*", () =>
        offline ? HttpResponse.error() : undefined,
      ),
    );
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await openRuChat(user);

    queue(reply("Я тут"));
    await vi.advanceTimersByTimeAsync(30_000);
    expect(screen.queryByText("Я тут")).toBeNull();
    offline = false;
    window.dispatchEvent(new Event("online"));

    expect(
      await within(messageList()).findByText("Я тут", {}, { timeout: 10_000 }),
    ).toBeDefined();
  });

  // @regression — functional §2.4 c5
  it("still shows «Текст» after a group message and a sticker", async () => {
    const user = userEvent.setup();
    await openRuChat(user);

    queue(
      notification(groupMessage),
      notification(
        webhook({ typeMessage: "stickerMessage" }, { idMessage: "S1" }),
      ),
      reply("Текст"),
    );

    await within(messageList()).findByText("Текст");
    expect(bubbles().map((b) => b.firstChild?.textContent)).toEqual([
      PLACEHOLDER,
      "Текст",
    ]);
  });

  // @regression — functional §2.4: after «Выйти», no more replies until the next sign-in
  it("stops receiving on «Выйти» and shows the waiting reply after signing in again", async () => {
    const user = userEvent.setup();
    await openRuChat(user);
    await vi.waitFor(() => {
      expect(received.length).toBeGreaterThan(0);
    });

    await user.click(screen.getByRole("button", { name: "Выйти" }));
    await screen.findByRole("button", { name: "Войти" });
    const polls = received.length;
    queue(reply("После выхода"));
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(received).toHaveLength(polls);
    expect(screen.queryByText("После выхода")).toBeNull();

    server.use(...ready());
    await user.type(screen.getByLabelText("idInstance"), ID);
    await user.type(screen.getByLabelText("apiTokenInstance"), "faketoken");
    await user.click(screen.getByRole("button", { name: "Войти" }));

    await vi.waitFor(() => {
      expect(row("+7 903 747-44-11").textContent).toContain("После выхода");
    });
  });
});

describe("the whole feature (acceptance)", () => {
  const NEW = "77011234567@c.us";

  // @regression — functional §2.1 c2, §2.2 c1/c2, §2.3 c1–c3, §2.4 c1–c3/c5 as one journey
  it("shows a 20-reply backlog after sign-in in the right chats, once each, and again once after a reload", async () => {
    saveChats({ [RU]: chat(RU, 2_000, [sent("Привет", at(8, 0))]) });
    const answers = Array.from({ length: 18 }, (_, i) =>
      reply(`Ответ ${String(i + 1)}`, { time: at(9, i + 1) }),
    );
    const [first, second, ...rest] = answers;
    queue(
      second, // delivered before the one sent earlier
      notification(groupMessage),
      first,
      notification(outgoingMessageReceived),
      notification(reactionMessage),
      { receiptId: ++receipts, body: "not a notification" },
      { ...first, receiptId: ++receipts }, // the same reply delivered twice
      ...rest,
      notification(
        webhook(
          { typeMessage: "stickerMessage" },
          { idMessage: "S1", timestamp: at(9, 19) / 1000 },
        ),
      ),
      reply("Здравствуйте", { chatId: NEW, time: at(9, 30) }),
    );
    server.use(...ready());
    await loadPage();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("idInstance"), ID);
    await user.type(screen.getByLabelText("apiTokenInstance"), "faketoken");
    await user.click(screen.getByRole("button", { name: "Войти" }));

    await vi.waitFor(() => {
      expect(titles()).toEqual(["+7 701 123-45-67", "+7 903 747-44-11"]);
    });
    await vi.waitFor(() => {
      expect(badge("+7 903 747-44-11")?.textContent).toBe("19");
    });
    expect(badge("+7 701 123-45-67")?.textContent).toBe("1");
    expect(row("+7 701 123-45-67").textContent).toContain("Здравствуйте");
    expect(row("+7 903 747-44-11").textContent).toContain(PLACEHOLDER);
    const expected = [
      "Привет",
      ...answers.map((_, i) => `Ответ ${String(i + 1)}`),
      PLACEHOLDER,
    ];
    await user.click(row("+7 903 747-44-11"));
    expect(bubbles().map((b) => b.firstChild?.textContent)).toEqual(expected);
    expect(bubbles().slice(1).every(isIncoming)).toBe(true);
    expect(screen.queryByText("👍")).toBeNull();
    expect(screen.queryByText("С телефона")).toBeNull();
    expect(screen.queryByText("Всем привет")).toBeNull();

    await openPage();
    const again = { ...answers[17], receiptId: ++receipts };
    queue(again);
    await vi.waitFor(() => {
      expect(deleted).toContain(again.receiptId);
    });
    await user.click(row("+7 903 747-44-11"));
    expect(bubbles().map((b) => b.firstChild?.textContent)).toEqual(expected);
  });

  // @regression — functional §2.2: a hidden sender can be written back to, and stays one chat
  it("replies in a «Неизвестный номер» chat to the hidden sender, whose next reply lands below", async () => {
    server.use(sentAs("BAE5"));
    signedIn();
    await openPage();
    queue(notification(lidWithoutName));
    await vi.waitFor(() => {
      expect(titles()).toEqual(["Неизвестный номер"]);
    });
    const user = userEvent.setup();
    await user.click(row("Неизвестный номер"));

    await user.type(
      screen.getByPlaceholderText("Введите сообщение"),
      "Кто это?{Enter}",
    );
    await vi.waitFor(() => {
      expect(posted).toHaveLength(1);
    });
    expect(posted[0].body).toEqual({
      chatId: "155508384256028@lid",
      message: "Кто это?",
    });

    queue(
      notification(
        textBody("Это Иван", {
          chatId: "155508384256028@lid",
          idMessage: "LID-2",
          timestamp: Math.floor(Date.now() / 1000) + 60,
          senderData: { senderName: "", senderContactName: "", chatName: "" },
        }),
      ),
    );

    await within(messageList()).findByText("Это Иван");
    expect(titles()).toEqual(["Неизвестный номер"]);
    expect(bubbles().map((b) => b.firstChild?.textContent)).toEqual([
      "Привет",
      "Кто это?",
      "Это Иван",
    ]);
  });

  // @regression — functional §2.4: GREEN-API refusing or slowing down never stops receiving
  it("keeps receiving after 401, 429 and 500 answers and shows the next reply within 10 s", async () => {
    vi.useFakeTimers({
      toFake: ["setTimeout", "clearTimeout"],
      shouldAdvanceTime: true,
    });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await openRuChat(user);

    queue(failure(401), failure(429), failure(500), reply("После паузы"));
    await vi.advanceTimersByTimeAsync(10_000);

    expect(within(messageList()).getByText("После паузы")).toBeDefined();
    expect(received.length).toBeGreaterThanOrEqual(4);
  });
});

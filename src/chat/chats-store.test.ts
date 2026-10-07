// @layer: unit
// @spec: 003-chats-sending
import { HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  API_URL,
  posted,
  reply,
  requests,
  sentAs,
  server,
  setupGreenApiServer,
} from "../test/green-api-server";
import {
  lastActivity,
  restoreChats,
  sortChats,
  storageKey,
  useChats,
  type Chat,
  type Message,
} from "./chats-store";
import type { Incoming } from "./notification";

setupGreenApiServer();

const A = "7103111111";
const B = "7103222222";
const RU = "79037474411@c.us";
const RS = "381629443720@c.us";
const CREDS = { idInstance: A, apiTokenInstance: "faketoken", apiUrl: API_URL };

const message = (patch: Partial<Message> = {}): Message => ({
  id: "m1",
  direction: "out",
  text: "Привет",
  time: 1_000,
  status: "sent",
  idMessage: "BAE5",
  ...patch,
});

const chat = (id: string, patch: Partial<Chat> = {}): Chat => ({
  id,
  createdAt: 500,
  messages: [],
  draft: "",
  ...patch,
});

function save(idInstance: string, chats: unknown, version = 1) {
  localStorage.setItem(
    storageKey(idInstance),
    JSON.stringify({ state: { chats }, version }),
  );
}

const saved = (idInstance: string) => {
  const raw = localStorage.getItem(storageKey(idInstance));
  return raw === null ? null : (JSON.parse(raw) as { state: unknown });
};

afterEach(() => {
  useChats.getState().wipe();
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("restoreChats", () => {
  // @regression — functional §2.4: a message still sending when the page closed → ❔
  it("turns sending into unknown and keeps every other status", () => {
    const messages = [
      message({ id: "1", status: "sending", idMessage: undefined }),
      message({ id: "2", status: "sent" }),
      message({ id: "3", status: "failed", idMessage: undefined }),
      message({ id: "4", status: "unknown", idMessage: undefined }),
    ];

    const restored = restoreChats({ chats: { [RU]: chat(RU, { messages }) } });

    expect(restored[RU].messages.map((m) => m.status)).toEqual([
      "unknown",
      "sent",
      "failed",
      "unknown",
    ]);
  });

  it("keeps drafts, times and the chats' order", () => {
    const chats = {
      [RS]: chat(RS, { draft: "черновик" }),
      [RU]: chat(RU, { messages: [message()] }),
    };

    expect(restoreChats({ chats })).toEqual(chats);
    expect(Object.keys(restoreChats({ chats }))).toEqual([RS, RU]);
  });

  it.each([
    ["nothing saved", undefined],
    ["a string", "chats"],
    ["no chats", {}],
    ["chats as an array", { chats: [] }],
    ["a chat under another key", { chats: { [RU]: chat(RS) } }],
    ["a chat without a draft", { chats: { [RU]: { ...chat(RU), draft: 1 } } }],
    [
      "a message with an unknown status",
      {
        chats: {
          [RU]: chat(RU, { messages: [message({ status: "read" as never })] }),
        },
      },
    ],
    [
      "an incoming message",
      {
        chats: {
          [RU]: chat(RU, { messages: [message({ direction: "in" as never })] }),
        },
      },
    ],
  ])("gives no chats for %s", (_, persisted) => {
    expect(restoreChats(persisted)).toEqual({});
  });
});

describe("sortChats", () => {
  // @regression — functional §2.2: newest activity first; an empty chat counts from its creation
  it("orders by the last message's time, or by creation for an empty chat", () => {
    const chats = {
      old: chat("old", { createdAt: 100 }),
      talked: chat("talked", {
        createdAt: 50,
        messages: [message({ time: 300 })],
      }),
      fresh: chat("fresh", { createdAt: 200 }),
    };

    expect(sortChats(chats).map((c) => c.id)).toEqual([
      "talked",
      "fresh",
      "old",
    ]);
  });

  it("puts the chat added later first on a tie", () => {
    const chats = { first: chat("first"), second: chat("second") };

    expect(sortChats(chats).map((c) => c.id)).toEqual(["second", "first"]);
  });
});

describe("useChats", () => {
  it("writes nothing and adds nothing before an instance is open", () => {
    useChats.getState().addChat(RU);

    expect(useChats.getState().chats).toEqual({});
    expect(localStorage.length).toBe(0);
  });

  // @regression — architecture §2: chats are kept per instance
  it("keeps each instance's chats under its own key", () => {
    useChats.getState().open(A);
    useChats.getState().addChat(RU);

    useChats.getState().open(B);
    useChats.getState().addChat(RS);

    expect(Object.keys(useChats.getState().chats)).toEqual([RS]);
    expect(saved(A)).toMatchObject({ state: { chats: { [RU]: { id: RU } } } });
    expect(saved(B)).toMatchObject({ state: { chats: { [RS]: { id: RS } } } });
    expect(Object.keys(saved(B)?.state as object)).toEqual(["chats"]);
  });

  // @regression — functional §2.4: chats come back after a reload, no chat selected
  it("loads the saved chats on open, with no chat selected", () => {
    save(A, { [RU]: chat(RU, { messages: [message({ status: "sending" })] }) });

    useChats.getState().open(A);

    const { chats, selectedId } = useChats.getState();
    expect(Object.keys(chats)).toEqual([RU]);
    expect(chats[RU].messages[0].status).toBe("unknown");
    expect(selectedId).toBeNull();
  });

  it("adds a chat once and selects it", () => {
    useChats.getState().open(A);

    useChats.getState().addChat(RU);
    const createdAt = useChats.getState().chats[RU].createdAt;
    useChats.getState().addChat(RS);
    useChats.getState().addChat(RU);

    const { chats, selectedId } = useChats.getState();
    expect(Object.keys(chats)).toEqual([RU, RS]);
    expect(chats[RU].createdAt).toBe(createdAt);
    expect(selectedId).toBe(RU);
  });

  it.each([
    [
      "unreadable JSON",
      () => {
        localStorage.setItem(storageKey(A), "{not json");
      },
    ],
    [
      "another version",
      () => {
        save(A, { [RU]: chat(RU) }, 0);
      },
    ],
  ])("starts with no chats for %s", (_, prepare) => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    prepare();

    useChats.getState().open(A);

    expect(useChats.getState().chats).toEqual({});
  });

  // @regression — review F1: an unreadable key never keeps or re-saves the previous instance's chats
  it("forgets the previous instance's chats when the next one's are unreadable", () => {
    useChats.getState().open(A);
    useChats.getState().addChat(RU);
    localStorage.setItem(storageKey(B), "{not json");

    useChats.getState().open(B);

    expect(useChats.getState().chats).toEqual({});
    expect(useChats.getState().selectedId).toBeNull();
    expect(localStorage.getItem(storageKey(B))).not.toContain(RU);
    expect(saved(A)).toMatchObject({ state: { chats: { [RU]: { id: RU } } } });
  });

  // @regression — functional §2.4: logout removes all chats from this browser
  it("removes the key on wipe, and nothing written later brings it back", () => {
    useChats.getState().open(A);
    useChats.getState().addChat(RU);
    expect(saved(A)).not.toBeNull();

    useChats.getState().wipe();
    useChats.getState().addChat(RS);
    useChats.getState().select(RU);

    expect(useChats.getState().chats).toEqual({});
    expect(localStorage.length).toBe(0);
  });

  it("sends: 🕓 with the draft cleared, then ✅ with the idMessage", async () => {
    server.use(sentAs("BAE5"));
    useChats.getState().open(A);
    useChats.getState().addChat(RU);
    useChats.getState().setDraft(RU, "Привет");

    const sending = useChats.getState().send(CREDS, RU, "Привет");
    expect(useChats.getState().chats[RU]).toMatchObject({
      draft: "",
      messages: [{ direction: "out", text: "Привет", status: "sending" }],
    });
    await sending;

    expect(useChats.getState().chats[RU].messages).toEqual([
      expect.objectContaining({ status: "sent", idMessage: "BAE5" }),
    ]);
    expect(saved(A)).toMatchObject({
      state: { chats: { [RU]: { messages: [{ status: "sent" }] } } },
    });
  });

  // @regression — tech §2.4: an answer after logout changes nothing and writes nothing
  it("drops a send answer that arrives after wipe", async () => {
    let answer = () => {};
    const gate = new Promise<void>((resolve) => {
      answer = resolve;
    });
    server.use(
      reply("sendMessage", async () => {
        await gate;
        return HttpResponse.json({ idMessage: "BAE5" });
      }),
    );
    useChats.getState().open(A);
    useChats.getState().addChat(RU);
    const sending = useChats.getState().send(CREDS, RU, "Привет");

    useChats.getState().wipe();
    answer();
    await sending;

    expect(useChats.getState().chats).toEqual({});
    expect(localStorage.length).toBe(0);
  });

  it("retries only ❗ and ❔ messages", async () => {
    server.use(sentAs("BAE6"));
    save(A, {
      [RU]: chat(RU, {
        messages: [
          message({ id: "ok", status: "sent" }),
          message({ id: "no", status: "failed", idMessage: undefined }),
        ],
      }),
    });
    useChats.getState().open(A);

    await useChats.getState().retry(CREDS, RU, "ok");
    expect(requests).toEqual([]);
    await useChats.getState().retry(CREDS, RU, "no");

    expect(posted.map((p) => p.body)).toEqual([
      { chatId: RU, message: "Привет" },
    ]);
    expect(useChats.getState().chats[RU].messages[1]).toMatchObject({
      status: "sent",
      idMessage: "BAE6",
    });
  });
});

describe("receive", () => {
  const LID = "155508384256027@lid";
  const incoming = (patch: Partial<Incoming> = {}): Incoming => ({
    chatId: RU,
    idMessage: "IN1",
    time: 2_000,
    text: "Привет-привет",
    ...patch,
  });
  const texts = (chatId: string) =>
    useChats.getState().chats[chatId].messages.map((m) => m.text);

  it("writes nothing before an instance is open", () => {
    useChats.getState().receive(incoming());

    expect(useChats.getState().chats).toEqual({});
    expect(localStorage.length).toBe(0);
  });

  // @regression — functional §2.2 c2: a reply from a new number opens a chat with a badge
  it("creates the chat, saves the reply and counts it unread", () => {
    vi.spyOn(Date, "now").mockReturnValue(5_000);
    useChats.getState().open(A);

    useChats.getState().receive(incoming());

    expect(useChats.getState().chats[RU]).toEqual({
      id: RU,
      createdAt: 5_000,
      draft: "",
      unread: 1,
      messages: [
        {
          id: expect.any(String) as string,
          direction: "in",
          text: "Привет-привет",
          time: 2_000,
          idMessage: "IN1",
        },
      ],
    });
    expect(saved(A)).toMatchObject({
      state: {
        chats: { [RU]: { unread: 1, messages: [{ idMessage: "IN1" }] } },
      },
    });
  });

  // @regression — functional §2.4 c3: the same reply delivered twice shows once
  it("ignores an idMessage the chat already has", () => {
    useChats.getState().open(A);

    useChats.getState().receive(incoming());
    useChats.getState().receive(incoming({ text: "другой" }));

    expect(texts(RU)).toEqual(["Привет-привет"]);
    expect(useChats.getState().chats[RU].unread).toBe(1);
  });

  // @regression — functional §2.1 c2, §2.2 c6: ordered by time; ties keep arrival order
  it("inserts by time, after messages sent at the same time", () => {
    save(A, {
      [RU]: chat(RU, {
        messages: [
          message({ id: "a", text: "10:00", time: 1_000 }),
          message({ id: "b", text: "11:00", time: 3_000 }),
        ],
      }),
    });
    useChats.getState().open(A);

    useChats
      .getState()
      .receive(incoming({ idMessage: "1", text: "поздний", time: 500 }));
    useChats
      .getState()
      .receive(incoming({ idMessage: "2", text: "ничья", time: 1_000 }));
    useChats
      .getState()
      .receive(incoming({ idMessage: "3", text: "ничья 2", time: 1_000 }));
    useChats
      .getState()
      .receive(incoming({ idMessage: "4", text: "свежий", time: 4_000 }));

    expect(texts(RU)).toEqual([
      "поздний",
      "10:00",
      "ничья",
      "ничья 2",
      "11:00",
      "свежий",
    ]);
  });

  // @regression — functional §2.2 c6: a late reply doesn't move the chat up
  it("keeps a chat with a late reply below newer activity", () => {
    save(A, {
      [RU]: chat(RU, { messages: [message({ time: 2_000 })] }),
      [RS]: chat(RS, { messages: [message({ time: 3_000 })] }),
    });
    useChats.getState().open(A);

    useChats.getState().receive(incoming({ chatId: RU, time: 1_000 }));

    expect(sortChats(useChats.getState().chats).map((c) => c.id)).toEqual([
      RS,
      RU,
    ]);
    expect(useChats.getState().chats[RU].messages.at(-1)?.time).toBe(2_000);
  });

  // @regression — review F1 (pr #12): a send after a reply stamped ahead of the local clock
  it("sends into time order, so the chat's preview and activity never move back", async () => {
    server.use(sentAs("BAE5"));
    vi.spyOn(Date, "now").mockReturnValue(5_000);
    useChats.getState().open(A);
    useChats.getState().addChat(RU);
    useChats.getState().receive(incoming({ time: 9_000 }));

    await useChats.getState().send(CREDS, RU, "Привет");

    const sent = useChats.getState().chats[RU];
    expect(sent.messages.map((m) => m.time)).toEqual([5_000, 9_000]);
    expect(sent.messages.at(-1)?.text).toBe("Привет-привет");
    expect(lastActivity(sent)).toBe(9_000);
  });

  // @regression — functional §2.2 c1: no badge in the open chat; opening clears it
  it("counts unread only outside the open chat, and select/addChat clear it", () => {
    useChats.getState().open(A);
    useChats.getState().addChat(RS);

    useChats.getState().receive(incoming({ chatId: RS, idMessage: "s1" }));
    useChats.getState().receive(incoming({ idMessage: "r1" }));
    useChats.getState().receive(incoming({ idMessage: "r2" }));
    expect(useChats.getState().chats[RS].unread).toBe(0);
    expect(useChats.getState().chats[RU].unread).toBe(2);

    useChats.getState().select(RU);
    expect(useChats.getState().chats[RU].unread).toBe(0);
    expect(saved(A)).toMatchObject({
      state: { chats: { [RU]: { unread: 0 } } },
    });

    useChats.getState().receive(incoming({ chatId: RS, idMessage: "s2" }));
    useChats.getState().addChat(RS);
    expect(useChats.getState().chats[RS].unread).toBe(0);
  });

  // @regression — functional §2.2 c3–c5: @lid chats titled by the WhatsApp name, kept apart
  it("titles @lid chats from a non-empty name and keeps the last one", () => {
    useChats.getState().open(A);

    useChats.getState().receive(incoming({ chatId: LID, idMessage: "1" }));
    expect(useChats.getState().chats[LID].title).toBeUndefined();
    useChats
      .getState()
      .receive(incoming({ chatId: LID, idMessage: "2", name: "Иван" }));
    useChats.getState().receive(incoming({ chatId: LID, idMessage: "3" }));
    expect(useChats.getState().chats[LID].title).toBe("Иван");
    useChats
      .getState()
      .receive(incoming({ chatId: LID, idMessage: "4", name: "Ваня" }));
    useChats.getState().receive(incoming({ idMessage: "5", name: "Иван" }));

    expect(useChats.getState().chats[LID].title).toBe("Ваня");
    expect(useChats.getState().chats[RU].title).toBeUndefined();
  });

  // @regression — tech §2.5: spec 003 data (no unread) still loads, at version 1
  it("loads spec 003 chats saved without unread, and keeps version 1", () => {
    save(A, { [RU]: chat(RU, { messages: [message()] }) });

    useChats.getState().open(A);
    useChats.getState().receive(incoming());

    expect(useChats.getState().chats[RU].unread).toBe(1);
    expect(texts(RU)).toEqual(["Привет", "Привет-привет"]);
    expect(saved(A)).toMatchObject({ version: 1 });
  });

  it("restores replies, placeholders, unread and titles", () => {
    const chats = {
      [RU]: chat(RU, {
        unread: 2,
        messages: [
          message(),
          {
            id: "i1",
            direction: "in",
            text: "Ок",
            time: 2_000,
            idMessage: "IN1",
          },
          {
            id: "i2",
            direction: "in",
            text: null,
            time: 3_000,
            idMessage: "IN2",
          },
        ],
      }),
      [LID]: chat(LID, { title: "Иван" }),
    };

    expect(restoreChats({ chats })).toEqual(chats);
  });

  it.each([
    ["a negative unread", { unread: -1 }],
    ["a string unread", { unread: "1" }],
    ["a number title", { title: 1 }],
    [
      "a reply without idMessage",
      { messages: [{ id: "i", direction: "in", text: "Ок", time: 1 }] },
    ],
    [
      "a reply with a number text",
      {
        messages: [
          { id: "i", direction: "in", text: 1, time: 1, idMessage: "x" },
        ],
      },
    ],
    [
      "a message in another direction",
      {
        messages: [
          { id: "i", direction: "up", text: "Ок", time: 1, idMessage: "x" },
        ],
      },
    ],
  ])("gives no chats for %s", (_, patch) => {
    expect(
      restoreChats({ chats: { [RU]: { ...chat(RU), ...patch } } }),
    ).toEqual({});
  });
});

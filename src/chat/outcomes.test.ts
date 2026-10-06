// @layer: integration
// @spec: 003-chats-sending
import { HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { GreenApiError, checkWhatsapp, sendMessage } from "../api/green-api";
import {
  API_URL,
  hang,
  posted,
  reply,
  sentAs,
  server,
  status,
  unreachable,
  whatsappExists,
  setupGreenApiServer,
} from "../test/green-api-server";
import {
  checkNumber,
  sendText,
  type CheckOutcome,
  type SendOutcome,
} from "./outcomes";

setupGreenApiServer();

const TOKEN = "faketoken";
const CREDENTIALS = {
  idInstance: "7103123456",
  apiTokenInstance: TOKEN,
  apiUrl: API_URL,
};
const CHAT_ID = "79001234567@c.us";

/** A 400 with the text GREEN-API documents for a number of the wrong length. */
const badPhoneNumber = () =>
  reply("checkWhatsapp", () =>
    HttpResponse.json(
      { code: 400, description: "Bad phone number, valid is 11-16 digits" },
      { status: 400 },
    ),
  );

// One row per line of tech §2.2, first table.
const CHECK_CASES: [string, Parameters<typeof server.use>, CheckOutcome][] = [
  ["existsWhatsapp: true", [whatsappExists(true)], "exists"],
  ["existsWhatsapp: false", [whatsappExists(false)], "notOnWhatsapp"],
  ["400 «Bad phone number»", [badPhoneNumber()], "invalidNumber"],
  [
    "400 «Bad phone number» as plain text",
    [
      reply("checkWhatsapp", () =>
        HttpResponse.text("Bad phone number", { status: 400 }),
      ),
    ],
    "invalidNumber",
  ],
  ["400 with an empty body", [status("checkWhatsapp", 400)], "checkFailed"],
  [
    "400 with another text",
    [
      reply("checkWhatsapp", () =>
        HttpResponse.json(
          { description: "Validation failed" },
          { status: 400 },
        ),
      ),
    ],
    "checkFailed",
  ],
  [
    "200 with {}",
    [reply("checkWhatsapp", () => HttpResponse.json({}))],
    "checkFailed",
  ],
  [
    "200 with a string existsWhatsapp",
    [
      reply("checkWhatsapp", () =>
        HttpResponse.json({ existsWhatsapp: "true" }),
      ),
    ],
    "checkFailed",
  ],
  [
    "200 with text/plain",
    [reply("checkWhatsapp", () => HttpResponse.text("true"))],
    "checkFailed",
  ],
  ["401", [status("checkWhatsapp", 401)], "checkFailed"],
  ["403", [status("checkWhatsapp", 403)], "checkFailed"],
  ["466 (plan limit)", [status("checkWhatsapp", 466)], "checkFailed"],
  ["429", [status("checkWhatsapp", 429)], "checkFailed"],
  ["500", [status("checkWhatsapp", 500)], "checkFailed"],
  ["502", [status("checkWhatsapp", 502)], "checkFailed"],
  ["fetch TypeError", [unreachable("checkWhatsapp")], "checkFailed"],
];

// One row per line of tech §2.2, second table.
const SEND_CASES: [string, Parameters<typeof server.use>, SendOutcome][] = [
  [
    "200 with an idMessage",
    [sentAs("BAE5F4886F6F2D05")],
    { outcome: "sent", idMessage: "BAE5F4886F6F2D05" },
  ],
  ["400", [status("sendMessage", 400)], { outcome: "failed" }],
  ["401", [status("sendMessage", 401)], { outcome: "failed" }],
  ["403", [status("sendMessage", 403)], { outcome: "failed" }],
  ["404", [status("sendMessage", 404)], { outcome: "failed" }],
  ["429", [status("sendMessage", 429)], { outcome: "failed" }],
  ["466 (plan limit)", [status("sendMessage", 466)], { outcome: "failed" }],
  ["200 with an empty idMessage", [sentAs("")], { outcome: "unknown" }],
  [
    "200 with {}",
    [reply("sendMessage", () => HttpResponse.json({}))],
    { outcome: "unknown" },
  ],
  [
    "200 with text/plain",
    [reply("sendMessage", () => HttpResponse.text("ok"))],
    { outcome: "unknown" },
  ],
  [
    "500 (payload too large)",
    [status("sendMessage", 500)],
    { outcome: "unknown" },
  ],
  ["502", [status("sendMessage", 502)], { outcome: "unknown" }],
  ["fetch TypeError", [unreachable("sendMessage")], { outcome: "unknown" }],
];

describe("checkNumber", () => {
  // @regression — functional §2.1: every check result → one outcome (tech §2.2)
  it.each(
    CHECK_CASES.map(([name, handlers, expected]) => ({
      name,
      handlers,
      expected,
    })),
  )("$name → $expected", async ({ handlers, expected }) => {
    server.use(...handlers);

    expect(await checkNumber(CREDENTIALS, CHAT_ID)).toBe(expected);
  });

  // @regression — functional §2.1: a check that can't be completed
  it("gives up with checkFailed when GREEN-API doesn't answer in time", async () => {
    server.use(hang("checkWhatsapp"));

    expect(await checkNumber(CREDENTIALS, CHAT_ID, { timeoutMs: 50 })).toBe(
      "checkFailed",
    );
  });

  it("POSTs { chatId } as JSON to the instance's own URL", async () => {
    const urls: string[] = [];
    server.use(
      reply("checkWhatsapp", ({ request }) => {
        urls.push(request.url);
        return HttpResponse.json({ existsWhatsapp: true });
      }),
    );

    await checkNumber(CREDENTIALS, CHAT_ID);

    expect(urls).toEqual([
      `${API_URL}/waInstance7103123456/checkWhatsapp/faketoken`,
    ]);
    expect(posted).toEqual([
      {
        method: "checkWhatsapp",
        contentType: "application/json",
        body: { chatId: CHAT_ID },
      },
    ]);
  });
});

describe("sendText", () => {
  // @regression — functional §2.3: ✅ / ❗ / ❔ come from these outcomes (tech §2.2)
  it.each(
    SEND_CASES.map(([name, handlers, expected]) => ({
      name,
      handlers,
      expected,
    })),
  )("$name → $expected.outcome", async ({ handlers, expected }) => {
    server.use(...handlers);

    expect(await sendText(CREDENTIALS, CHAT_ID, "Привет")).toEqual(expected);
  });

  // @regression — functional §2.3: no answer → ❔, it may have been queued
  it("is unknown when GREEN-API doesn't answer in time", async () => {
    server.use(hang("sendMessage"));

    expect(
      await sendText(CREDENTIALS, CHAT_ID, "Привет", { timeoutMs: 50 }),
    ).toEqual({ outcome: "unknown" });
  });

  // @regression — functional §2.3: the text is sent exactly as typed
  it("POSTs { chatId, message } as JSON, the text untouched", async () => {
    const text = "  Привет\nвторая строка  ";
    const urls: string[] = [];
    server.use(
      reply("sendMessage", ({ request }) => {
        urls.push(request.url);
        return HttpResponse.json({ idMessage: "BAE5" });
      }),
    );

    await sendText(CREDENTIALS, CHAT_ID, text);

    expect(urls).toEqual([
      `${API_URL}/waInstance7103123456/sendMessage/faketoken`,
    ]);
    expect(posted).toEqual([
      {
        method: "sendMessage",
        contentType: "application/json",
        body: { chatId: CHAT_ID, message: text },
      },
    ]);
  });
});

describe("client errors", () => {
  const caught = async (call: (signal: AbortSignal) => Promise<unknown>) => {
    try {
      await call(AbortSignal.timeout(50));
    } catch (error) {
      return error;
    }
    throw new Error("expected the call to fail");
  };

  // @regression — tech §2.2: errors never carry the token
  it.each([
    ["400 Bad phone number", badPhoneNumber(), "checkWhatsapp"],
    ["fetch TypeError", unreachable("checkWhatsapp"), "checkWhatsapp"],
    ["timeout", hang("checkWhatsapp"), "checkWhatsapp"],
    ["500", status("sendMessage", 500), "sendMessage"],
    ["fetch TypeError", unreachable("sendMessage"), "sendMessage"],
    ["timeout", hang("sendMessage"), "sendMessage"],
  ] as const)("%s on %s has no token", async (_, handler, method) => {
    server.use(handler);

    const error = await caught((signal) =>
      method === "checkWhatsapp"
        ? checkWhatsapp(CREDENTIALS, CHAT_ID, signal)
        : sendMessage(CREDENTIALS, { chatId: CHAT_ID, message: "x" }, signal),
    );

    expect(error).toBeInstanceOf(GreenApiError);
    const seen = [
      String(error),
      (error as GreenApiError).stack ?? "",
      (error as GreenApiError).text,
      JSON.stringify(error),
    ].join("\n");
    expect(seen).not.toContain(TOKEN);
  });
});

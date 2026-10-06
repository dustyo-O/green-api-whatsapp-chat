// @layer: integration
// @spec: 004-receiving-replies
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import {
  API_URL,
  failure,
  server,
  setupGreenApiServer,
} from "../test/green-api-server";
import {
  GreenApiError,
  deleteNotification,
  receiveNotification,
} from "./green-api";

setupGreenApiServer();

const TOKEN = "faketoken";
const CREDENTIALS = {
  idInstance: "7103123456",
  apiTokenInstance: TOKEN,
  apiUrl: API_URL,
};
const signal = () => new AbortController().signal;

/** Answers every receive with `answer` and records the requests. */
function receiveAnswers(answer: () => Response) {
  const seen: Request[] = [];
  server.use(
    http.get("*/receiveNotification/*", ({ request }) => {
      seen.push(request);
      return answer();
    }),
  );
  return seen;
}

function deleteAnswers(answer: () => Response) {
  const seen: Request[] = [];
  server.use(
    http.delete("*/deleteNotification/*/*", ({ request }) => {
      seen.push(request);
      return answer();
    }),
  );
  return seen;
}

/** The error a call rejects with, checked to never carry the token. */
async function rejection(call: Promise<unknown>): Promise<GreenApiError> {
  const error = await call.then(
    () => {
      throw new Error("resolved");
    },
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(GreenApiError);
  expect(JSON.stringify(error)).not.toContain(TOKEN);
  expect(String(error)).not.toContain(TOKEN);
  return error as GreenApiError;
}

describe("receiveNotification", () => {
  it("long-polls the queue with GET and receiveTimeout", async () => {
    const seen = receiveAnswers(() => new HttpResponse(""));

    await receiveNotification(CREDENTIALS, 5, signal());

    expect(seen.map((r) => [r.method, r.url])).toEqual([
      [
        "GET",
        `${API_URL}/waInstance7103123456/receiveNotification/${TOKEN}?receiveTimeout=5`,
      ],
    ]);
  });

  // @regression — tech §3 risk 2: the empty queue never turns into badBody
  it.each([
    ["an empty body", () => new HttpResponse("")],
    [
      "an empty JSON body",
      () =>
        new HttpResponse("", {
          headers: { "Content-Type": "application/json" },
        }),
    ],
    ["null", () => HttpResponse.json(null)],
  ])("gives null for %s", async (_, answer) => {
    receiveAnswers(answer);

    expect(await receiveNotification(CREDENTIALS, 5, signal())).toBeNull();
  });

  it("gives the receiptId and the body", async () => {
    const body = { typeWebhook: "incomingMessageReceived" };
    receiveAnswers(() => HttpResponse.json({ receiptId: 7, body }));

    expect(await receiveNotification(CREDENTIALS, 5, signal())).toEqual({
      receiptId: 7,
      body,
    });
  });

  it.each([
    ["no receiptId", { body: {} }],
    ["a string receiptId", { receiptId: "7", body: {} }],
    ["an array", []],
  ])("rejects a notification with %s as badBody", async (_, answer) => {
    receiveAnswers(() => HttpResponse.json(answer));

    const error = await rejection(
      receiveNotification(CREDENTIALS, 5, signal()),
    );

    expect(error.kind).toBe("badBody");
  });

  it("rejects a 401 with an empty body as http 401", async () => {
    receiveAnswers(() => failure(401));

    const error = await rejection(
      receiveNotification(CREDENTIALS, 5, signal()),
    );

    expect([error.kind, error.status]).toEqual(["http", 401]);
  });
});

describe("deleteNotification", () => {
  it("sends DELETE with the receiptId after the token", async () => {
    const seen = deleteAnswers(() => HttpResponse.json({ result: true }));

    await deleteNotification(CREDENTIALS, 42, signal());

    expect(seen.map((r) => [r.method, r.url])).toEqual([
      [
        "DELETE",
        `${API_URL}/waInstance7103123456/deleteNotification/${TOKEN}/42`,
      ],
    ]);
  });

  // @regression — tech §2.4: deleted now, or already gone
  it.each([
    ["result: true", () => HttpResponse.json({ result: true })],
    ["result: false", () => HttpResponse.json({ result: false })],
    [
      "the documented 500 «not found»",
      () =>
        HttpResponse.json(
          {
            message:
              "Cannot read properties of undefined (reading 'findUnAckedMessage')",
            path: `/waInstance7103123456/deleteNotification/${TOKEN}/42`,
          },
          { status: 500 },
        ),
    ],
  ])("resolves for %s", async (_, answer) => {
    deleteAnswers(answer);

    await expect(
      deleteNotification(CREDENTIALS, 42, signal()),
    ).resolves.toBeUndefined();
  });

  it.each([
    ["another 500", () => failure(500), "http"],
    ["429", () => failure(429), "http"],
    ["401", () => failure(401), "http"],
    ["a 200 without result", () => HttpResponse.json({}), "badBody"],
  ])("rejects %s", async (_, answer, kind) => {
    deleteAnswers(answer);

    const error = await rejection(
      deleteNotification(CREDENTIALS, 42, signal()),
    );

    expect(error.kind).toBe(kind);
    expect(error.notFound).toBe(false);
  });
});

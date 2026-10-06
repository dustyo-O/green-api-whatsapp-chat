// Test-only MSW server for GREEN-API. Each test file calls `setupGreenApiServer()`; never the global
// setup, because the e2e tests make real local requests.
import { delay, http, HttpResponse, type HttpResponseResolver } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll } from "vitest";
import type { Notification } from "../api/green-api";

export const API_URL = "https://7103.api.greenapi.com";

type Method =
  "getStateInstance" | "getSettings" | "checkWhatsapp" | "sendMessage";

const POST_METHODS: readonly Method[] = ["checkWhatsapp", "sendMessage"];

/** What one `receiveNotification` call answers: a notification, empty, or this response. */
export type QueueAnswer = Notification | null | Response;

let queued: QueueAnswer[] = [];

/**
 * Appends to GREEN-API's notification queue. A notification stays at the head until it is
 * deleted (a real FIFO, so a failed delete re-delivers it); `null` (an empty body) and responses
 * are answered once. An empty queue never answers, so the client's own budget or abort ends it.
 */
export function queue(...answers: QueueAnswer[]) {
  queued.push(...answers);
}

const isNotification = (
  answer: QueueAnswer | undefined,
): answer is Notification =>
  answer !== undefined && answer !== null && !(answer instanceof Response);

// In `setupServer`, so `resetHandlers()` keeps them: every signed-in page polls.
const notificationQueue = [
  http.get("*/receiveNotification/*", async () => {
    const head = queued.at(0);
    if (head === undefined) {
      // A long poll that never ends; the client's abort rejects its fetch.
      await delay("infinite");
      return new HttpResponse(null);
    }
    if (isNotification(head)) return HttpResponse.json(head);
    queued.shift();
    return head ?? new HttpResponse("", { headers: JSON_TYPE });
  }),
  http.delete("*/deleteNotification/*/:receiptId", ({ params }) => {
    const head = queued.at(0);
    const found =
      isNotification(head) && head.receiptId === Number(params.receiptId);
    if (found) queued.shift();
    return HttpResponse.json({ result: found });
  }),
];

export const server = setupServer(...notificationQueue);

/** Methods requested since the test started, in order (the notification queue aside). */
export const requests: Method[] = [];

/** The `receiveTimeout` of every `receiveNotification` call since the test started. */
export const received: number[] = [];

/** The `receiptId` of every `deleteNotification` call since the test started. */
export const deleted: number[] = [];

/** POST calls since the test started, in order, as the handlers received them. */
export const posted: {
  method: Method;
  contentType: string | null;
  body: unknown;
}[] = [];

export function setupGreenApiServer() {
  beforeAll(() => {
    server.listen({ onUnhandledFrame: "error" });
    server.events.on("request:start", ({ request }) => {
      const url = new URL(request.url);
      const [, , method, , receiptId] = url.pathname.split("/");
      if (method === "receiveNotification") {
        received.push(Number(url.searchParams.get("receiveTimeout")));
      } else if (method === "deleteNotification") {
        deleted.push(Number(receiptId));
      } else {
        requests.push(method as Method);
      }
    });
  });
  afterEach(() => {
    server.resetHandlers();
    requests.length = 0;
    posted.length = 0;
    received.length = 0;
    deleted.length = 0;
    queued = [];
  });
  afterAll(() => {
    server.close();
  });
}

/** Answers `method` on any host and instance; POST methods also record their body in `posted`. */
export function reply(method: Method, resolver: HttpResponseResolver) {
  if (!POST_METHODS.includes(method)) {
    return http.get(`*/${method}/*`, resolver);
  }
  return http.post(`*/${method}/*`, async (info) => {
    posted.push({
      method,
      contentType: info.request.headers.get("Content-Type"),
      body: (await info.request.clone().json()) as unknown,
    });
    return resolver(info);
  });
}

export const stateIs = (stateInstance: unknown) =>
  reply("getStateInstance", () => HttpResponse.json({ stateInstance }));

export const settingsAre = (settings: Record<string, unknown>) =>
  reply("getSettings", () => HttpResponse.json(settings));

export const READY_SETTINGS = { webhookUrl: "", incomingWebhook: "yes" };

/** A ready instance: authorized, no webhook, incoming notifications on. */
export const ready = () => [stateIs("authorized"), settingsAre(READY_SETTINGS)];

export const whatsappExists = (existsWhatsapp: boolean) =>
  reply("checkWhatsapp", () =>
    HttpResponse.json({ existsWhatsapp, chatId: "1234567890@lid" }),
  );

export const sentAs = (idMessage: string) =>
  reply("sendMessage", () => HttpResponse.json({ idMessage }));

const JSON_TYPE = { "Content-Type": "application/json" };

/** GREEN-API's real error shape: JSON content type, empty body. */
export const failure = (code: number) =>
  new HttpResponse(null, { status: code, headers: JSON_TYPE });

export const status = (method: Method, code: number) =>
  reply(method, () => failure(code));

/** Rejects `fetch` with a TypeError, like offline, DNS or a CORS-less 403. */
export const unreachable = (method: Method) =>
  reply(method, () => HttpResponse.error());

/** Never answers. */
export const hang = (method: Method) =>
  reply(method, async () => {
    await delay("infinite");
    return HttpResponse.json({});
  });

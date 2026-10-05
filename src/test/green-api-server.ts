// Test-only MSW server for GREEN-API. Each test file calls `setupGreenApiServer()`; never the global
// setup, because the e2e tests make real local requests.
import { delay, http, HttpResponse, type HttpResponseResolver } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll } from "vitest";

export const API_URL = "https://7103.api.greenapi.com";

type Method = "getStateInstance" | "getSettings";

export const server = setupServer();

/** Methods requested since the test started, in order. */
export const requests: Method[] = [];

export function setupGreenApiServer() {
  beforeAll(() => {
    server.listen({ onUnhandledFrame: "error" });
    server.events.on("request:start", ({ request }) => {
      requests.push(new URL(request.url).pathname.split("/")[2] as Method);
    });
  });
  afterEach(() => {
    server.resetHandlers();
    requests.length = 0;
  });
  afterAll(() => {
    server.close();
  });
}

/** Answers `method` on any host and instance. */
export function reply(method: Method, resolver: HttpResponseResolver) {
  return http.get(`*/${method}/*`, resolver);
}

export const stateIs = (stateInstance: unknown) =>
  reply("getStateInstance", () => HttpResponse.json({ stateInstance }));

export const settingsAre = (settings: Record<string, unknown>) =>
  reply("getSettings", () => HttpResponse.json(settings));

export const READY_SETTINGS = { webhookUrl: "", incomingWebhook: "yes" };

/** A ready instance: authorized, no webhook, incoming notifications on. */
export const ready = () => [stateIs("authorized"), settingsAre(READY_SETTINGS)];

/** GREEN-API's real error shape: JSON content type, empty body. */
export const status = (method: Method, code: number) =>
  reply(
    method,
    () =>
      new HttpResponse(null, {
        status: code,
        headers: { "Content-Type": "application/json" },
      }),
  );

/** Rejects `fetch` with a TypeError, like offline, DNS or a CORS-less 403. */
export const unreachable = (method: Method) =>
  reply(method, () => HttpResponse.error());

/** Never answers. */
export const hang = (method: Method) =>
  reply(method, async () => {
    await delay("infinite");
    return HttpResponse.json({});
  });

// @layer: integration
// @spec: 002-sign-in-session
import { HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import {
  API_URL,
  READY_SETTINGS,
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
import { checkInstance, type CheckError } from "./check-instance";

setupGreenApiServer();

const CREDENTIALS = {
  idInstance: "7103123456",
  apiTokenInstance: "faketoken",
  apiUrl: API_URL,
};

const authorized = stateIs("authorized");

// One row per line of tech §2.2.
const CASES: [string, Parameters<typeof server.use>, CheckError | null][] = [
  [
    "401 with an empty JSON body",
    [status("getStateInstance", 401)],
    "wrongCredentials",
  ],
  ["403", [status("getStateInstance", 403)], "wrongCredentials"],
  ["fetch TypeError", [unreachable("getStateInstance")], "unreachable"],
  ["429", [status("getStateInstance", 429)], "unknown"],
  ["500", [status("getStateInstance", 500)], "unknown"],
  ["404", [status("getStateInstance", 404)], "unknown"],
  [
    "200 with text/plain",
    [reply("getStateInstance", () => HttpResponse.text("authorized"))],
    "unknown",
  ],
  [
    "200 with {}",
    [reply("getStateInstance", () => HttpResponse.json({}))],
    "unknown",
  ],
  ["state notAuthorized", [stateIs("notAuthorized")], "notAuthorized"],
  ["state sleepMode", [stateIs("sleepMode")], "sleepMode"],
  ["state starting", [stateIs("starting")], "starting"],
  ["state blocked", [stateIs("blocked")], "blocked"],
  ["state suspended", [stateIs("suspended")], "restricted"],
  ["state yellowCard", [stateIs("yellowCard")], "restricted"],
  ["an unknown state", [stateIs("somethingNew")], "unknown"],
  ["a non-string state", [stateIs(42)], "unknown"],
  [
    "settings without webhookUrl",
    [authorized, settingsAre({ incomingWebhook: "yes" })],
    "unknown",
  ],
  [
    "settings with a null webhookUrl",
    [authorized, settingsAre({ webhookUrl: null, incomingWebhook: "yes" })],
    "unknown",
  ],
  [
    "settings without incomingWebhook",
    [authorized, settingsAre({ webhookUrl: "" })],
    "unknown",
  ],
  [
    "401 on getSettings",
    [authorized, status("getSettings", 401)],
    "wrongCredentials",
  ],
  [
    "TypeError on getSettings",
    [authorized, unreachable("getSettings")],
    "unreachable",
  ],
  [
    "a webhook URL set",
    [
      authorized,
      settingsAre({
        webhookUrl: "https://hook.example",
        incomingWebhook: "yes",
      }),
    ],
    "webhookSet",
  ],
  [
    "incoming notifications off",
    [authorized, settingsAre({ webhookUrl: "", incomingWebhook: "no" })],
    "incomingOff",
  ],
  [
    "a blank webhook URL and notifications on",
    [authorized, settingsAre({ ...READY_SETTINGS, webhookUrl: "  " })],
    null,
  ],
  ["a ready instance", ready(), null],
];

describe("checkInstance", () => {
  it.each(
    CASES.map(([name, handlers, expected]) => ({ name, handlers, expected })),
  )("$name → $expected", async ({ handlers, expected }) => {
    server.use(...handlers);

    expect(await checkInstance(CREDENTIALS)).toBe(expected);
  });

  it("gives up with the catch-all when GREEN-API doesn't answer in time", async () => {
    server.use(hang("getStateInstance"));

    expect(await checkInstance(CREDENTIALS, { timeoutMs: 50 })).toBe("unknown");
  });

  it("shares one time budget between both calls", async () => {
    server.use(authorized, hang("getSettings"));

    expect(await checkInstance(CREDENTIALS, { timeoutMs: 50 })).toBe("unknown");
  });

  it("doesn't ask for settings when the instance isn't authorized", async () => {
    server.use(stateIs("notAuthorized"), settingsAre(READY_SETTINGS));

    await checkInstance(CREDENTIALS);

    expect(requests).toEqual(["getStateInstance"]);
  });

  it("asks for the state, then the settings, at the instance's own URL", async () => {
    const urls: string[] = [];
    server.use(
      reply("getStateInstance", ({ request }) => {
        urls.push(request.url);
        return HttpResponse.json({ stateInstance: "authorized" });
      }),
      reply("getSettings", ({ request }) => {
        urls.push(request.url);
        return HttpResponse.json(READY_SETTINGS);
      }),
    );

    await checkInstance(CREDENTIALS);

    expect(urls).toEqual([
      `${API_URL}/waInstance7103123456/getStateInstance/faketoken`,
      `${API_URL}/waInstance7103123456/getSettings/faketoken`,
    ]);
  });
});

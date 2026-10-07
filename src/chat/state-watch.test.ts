// @layer: integration
// @spec: 005-connection-auth-states
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  API_URL,
  requests,
  server,
  setupGreenApiServer,
  stateIs,
  status as answer,
  unreachable,
} from "../test/green-api-server";
import { useChats } from "./chats-store";
import { watchInstanceState } from "./state-watch";
import { useStatus } from "./status-store";

setupGreenApiServer();

const ID = "7103123456";
const CREDS = {
  idInstance: ID,
  apiTokenInstance: "faketoken",
  apiUrl: API_URL,
};
const MIN = 60_000;

const loops: AbortController[] = [];

function start() {
  const controller = new AbortController();
  loops.push(controller);
  return { controller, done: watchInstanceState(CREDS, controller.signal) };
}

// Kept before any test fakes `setTimeout`.
const realSetTimeout = globalThis.setTimeout;

/** Lets MSW's real I/O run without moving fake timers. */
async function flush() {
  for (let i = 0; i < 20; i++) {
    await new Promise((resolve) => realSetTimeout(resolve, 0));
  }
}

/** Advances fake time, then lets MSW answer. */
async function advance(ms: number) {
  await vi.advanceTimersByTimeAsync(ms);
  await flush();
}

const checks = () => requests.filter((m) => m === "getStateInstance").length;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  useChats.getState().open(ID);
});

afterEach(async () => {
  for (const loop of loops.splice(0)) loop.abort();
  vi.useRealTimers();
  await flush();
  useStatus.getState().reset();
  useChats.getState().wipe();
  localStorage.clear();
});

describe("watchInstanceState", () => {
  // @regression — tech §2.1: the bound for a logout when stateWebhook is off; not before 4 min
  it("checks the state 4 minutes after start and every 4 minutes after, not before", async () => {
    server.use(stateIs("notAuthorized"));

    start();
    await advance(4 * MIN - 1);
    expect(checks()).toBe(0);
    await advance(1);

    expect(checks()).toBe(1);
    expect(useStatus.getState().instanceState).toBe("notAuthorized");

    server.use(stateIs("authorized"));
    await advance(4 * MIN);
    expect(checks()).toBe(2);
    expect(useStatus.getState().instanceState).toBe("authorized");
  });

  // @regression — tech §2.2 row 2: the watch confirms a bad key too
  it.each([401, 403])("marks the key invalid on %i", async (code) => {
    server.use(answer("getStateInstance", code));

    start();
    await advance(4 * MIN);

    expect(useStatus.getState().keyInvalid).toBe(true);
  });

  // @regression — review 3 F2: a failed check is retried every 30 s, the state left as it was
  it("ignores a network failure, a 429 or a 5xx and retries every 30 s until a check succeeds", async () => {
    useStatus.setState({ instanceState: "blocked" });
    server.use(unreachable("getStateInstance"));

    start();
    await advance(4 * MIN);
    expect(checks()).toBe(1);
    expect(useStatus.getState()).toMatchObject({
      instanceState: "blocked",
      keyInvalid: false,
      noConnection: false,
    });

    server.use(answer("getStateInstance", 429));
    await advance(30_000);
    server.use(answer("getStateInstance", 502));
    await advance(30_000);
    expect(checks()).toBe(3);
    expect(useStatus.getState().instanceState).toBe("blocked");

    server.use(stateIs("authorized"));
    await advance(30_000);
    expect(checks()).toBe(4);
    expect(useStatus.getState().instanceState).toBe("authorized");
    await advance(30_000);
    expect(checks()).toBe(4); // back to every 4 minutes
  });

  // @regression — tech §2.1: stopped with the receive loop's controller, and on logout
  it("stops on abort, and writes nothing once the session is over", async () => {
    server.use(stateIs("notAuthorized"));
    const first = start();
    first.controller.abort();
    await first.done;
    await advance(10 * MIN);
    expect(checks()).toBe(0);

    start();
    useChats.getState().wipe(); // logout
    await advance(10 * MIN);

    expect(checks()).toBe(0);
    expect(useStatus.getState().instanceState).toBe("authorized");
  });
});

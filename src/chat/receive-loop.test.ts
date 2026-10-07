// @layer: integration
// @spec: 004-receiving-replies
import { delay, http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  API_URL,
  deleted,
  failure,
  queue,
  received,
  requests,
  server,
  setupGreenApiServer,
  stateIs,
  status as answer,
} from "../test/green-api-server";
import { storageKey, useChats } from "./chats-store";
import {
  CONTACT,
  groupMessage,
  outgoingMessageReceived,
  stateChanged,
  stickerMessage,
  textBody,
  textMessage,
} from "./notification.fixtures";
import { runReceiveLoop } from "./receive-loop";
import { useStatus } from "./status-store";

setupGreenApiServer();

const ID = "7103123456";
const CREDS = {
  idInstance: ID,
  apiTokenInstance: "faketoken",
  apiUrl: API_URL,
};

const loops: AbortController[] = [];

/** Starts a loop the test can stop; every loop is stopped after the test. */
function start() {
  const controller = new AbortController();
  loops.push(controller);
  return { controller, done: runReceiveLoop(CREDS, controller.signal) };
}

const texts = () =>
  CONTACT in useChats.getState().chats
    ? useChats.getState().chats[CONTACT].messages.map((m) => m.text)
    : [];

// Kept before any test fakes `setTimeout`.
const realSetTimeout = globalThis.setTimeout;

/** Lets MSW's real I/O run without moving fake timers. */
async function flush() {
  for (let i = 0; i < 20; i++) {
    await new Promise((resolve) => realSetTimeout(resolve, 0));
  }
}

/** Advances fake time step by step; the receive count after each step. */
async function receivesAfter(steps: number[]) {
  await flush();
  const counts = [received.length];
  for (const ms of steps) {
    await vi.advanceTimersByTimeAsync(ms);
    await flush();
    counts.push(received.length);
  }
  return counts;
}

beforeEach(() => {
  useChats.getState().open(ID);
});

afterEach(async () => {
  for (const loop of loops.splice(0)) loop.abort();
  vi.useRealTimers();
  vi.restoreAllMocks();
  await flush();
  useStatus.getState().reset();
  useChats.getState().wipe();
  localStorage.clear();
});

describe("runReceiveLoop", () => {
  // @regression — tech §2.4: write before acknowledge, so a reply is never lost
  it("saves a reply before it deletes it", async () => {
    const atDelete: (string | null)[] = [];
    server.use(
      // Observes, then falls through to the queue's own DELETE.
      http.delete("*/deleteNotification/*/*", () => {
        atDelete.push(localStorage.getItem(storageKey(ID)));
      }),
    );
    queue({ receiptId: 1, body: textMessage });

    start();

    await vi.waitFor(() => {
      expect(deleted).toEqual([1]);
    });
    expect(atDelete).toHaveLength(1);
    expect(atDelete[0]).toContain("F7AEC1B7086ECDC7E6E45923F5EDB825");
    expect(texts()).toEqual(["Привет-привет"]);
    expect(received.every((timeout) => timeout === 5)).toBe(true);
  });

  // @regression — functional §2.4 c5: nothing blocks later replies
  it("deletes what it skips, in order, and keeps going", async () => {
    queue(
      { receiptId: 1, body: groupMessage },
      { receiptId: 2, body: outgoingMessageReceived },
      { receiptId: 3, body: { garbage: true } },
      { receiptId: 4, body: stickerMessage },
      { receiptId: 5, body: textBody("Текст", { idMessage: "T2" }) },
    );

    start();

    await vi.waitFor(() => {
      expect(deleted).toEqual([1, 2, 3, 4, 5]);
    });
    expect(Object.keys(useChats.getState().chats)).toEqual([CONTACT]);
    expect(texts()).toEqual([null, "Текст"]);
  });

  // @regression — review F2 (pr #12): a time JSON can't keep would wipe every chat on reload
  it("skips a timestamp beyond the Date range, so saved chats still restore", async () => {
    queue(
      { receiptId: 1, body: textMessage },
      {
        receiptId: 2,
        body: textBody("x", { idMessage: "BIG", timestamp: 1e308 }),
      },
    );

    start();

    await vi.waitFor(() => {
      expect(deleted).toEqual([1, 2]);
    });
    useChats.getState().open(ID);
    expect(texts()).toEqual(["Привет-привет"]);
  });

  it("goes on after an empty answer", async () => {
    queue(null, { receiptId: 1, body: textMessage });

    start();

    await vi.waitFor(() => {
      expect(texts()).toEqual(["Привет-привет"]);
    });
  });

  // @regression — functional §2.4 c3: a redelivery after a failed delete shows once
  it("shows a reply once when a failed delete delivers it again", async () => {
    server.use(
      http.delete("*/deleteNotification/*/*", () => failure(429), {
        once: true,
      }),
    );
    queue({ receiptId: 1, body: textMessage });

    start();

    await vi.waitFor(
      () => {
        expect(deleted).toEqual([1, 1]);
      },
      { timeout: 3_000 },
    );
    expect(texts()).toEqual(["Привет-привет"]);
  });

  // @regression — PR #12 review F1: a save that throws backs off, keeps the reply queued, goes on
  it("keeps a reply queued and goes on when saving it throws", async () => {
    const setItem = localStorage.setItem.bind(localStorage);
    let fail = true;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation((key, value) => {
      if (fail && key === storageKey(ID)) {
        fail = false;
        throw new DOMException("full", "QuotaExceededError");
      }
      setItem(key, value);
    });
    const atDelete: (string | null)[] = [];
    server.use(
      http.delete("*/deleteNotification/*/*", () => {
        atDelete.push(localStorage.getItem(storageKey(ID)));
      }),
    );
    queue(
      { receiptId: 1, body: textMessage },
      { receiptId: 2, body: textBody("Текст", { idMessage: "T2" }) },
    );

    const { controller, done } = start();

    await vi.waitFor(
      () => {
        expect(deleted).toEqual([1, 2]);
      },
      { timeout: 3_000 },
    );
    expect(received.length).toBeGreaterThanOrEqual(3); // the first one came twice
    expect(atDelete[0]).toContain("F7AEC1B7086ECDC7E6E45923F5EDB825");
    controller.abort();
    await done;

    useChats.getState().open(ID); // a reload: back from localStorage only
    expect(texts()).toEqual(["Привет-привет", "Текст"]);
  });

  // @regression — tech §2.4 R4: abort stops everything, also a waiting poll
  it("stops on abort, during a poll and during a backoff", async () => {
    const polling = start();
    await vi.waitFor(() => {
      expect(received).toHaveLength(1);
    });

    polling.controller.abort();
    await polling.done;

    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    queue(failure(500));
    const backingOff = start();
    await flush();
    expect(received).toHaveLength(2);
    backingOff.controller.abort();
    await backingOff.done;

    queue({ receiptId: 1, body: textMessage });
    await vi.advanceTimersByTimeAsync(10_000);
    await flush();
    expect(received).toHaveLength(2);
    expect(deleted).toEqual([]);
    expect(texts()).toEqual([]);
  });

  // @regression — functional §2.4 «Выйти»: a reply received during logout stays queued
  it("neither saves nor deletes a reply that arrives after logout", async () => {
    let answer = () => {};
    const gate = new Promise<void>((resolve) => {
      answer = resolve;
    });
    server.use(
      http.get("*/receiveNotification/*", async () => {
        await gate;
        return HttpResponse.json({ receiptId: 1, body: textMessage });
      }),
    );
    const { done } = start();
    await vi.waitFor(() => {
      expect(received).toHaveLength(1);
    });

    useChats.getState().wipe();
    answer();
    await done;

    expect(received).toHaveLength(1);
    expect(deleted).toEqual([]);
    expect(localStorage.length).toBe(0);
  });

  // @regression — tech §2.4: 1 → 2 → 4 → 5 → 5 s on any failure, reset by a successful receive
  it("backs off 1, 2, 4, 5, 5 seconds, and starts over after a success", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    server.use(answer("getStateInstance", 401)); // asked after the receive 401
    queue(
      failure(500),
      HttpResponse.error(),
      failure(429),
      failure(401),
      HttpResponse.json({ body: {} }), // no receiptId → badBody
      null,
      failure(500),
    );

    start();

    expect(
      await receivesAfter([
        999, 1, 1_999, 1, 3_999, 1, 4_999, 1, 4_999, 1, 999, 1,
      ]),
    ).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 7, 7, 8]);
  });

  // @regression — review 3 F3: only a successful delete resets the backoff, so no hot loop
  it("backs off when a delete keeps failing, re-receiving the same head", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    server.use(http.delete("*/deleteNotification/*/*", () => failure(500)));
    queue({ receiptId: 1, body: textMessage });

    start();

    expect(
      await receivesAfter([999, 1, 1_999, 1, 3_999, 1, 4_999, 1, 5_000]),
    ).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5, 6]);
    expect(deleted).toEqual([1, 1, 1, 1, 1, 1]);
    expect(texts()).toEqual(["Привет-привет"]);
  });

  // @regression — review 3 F2: back online → poll now, not after a stalled request's budget
  it("drops a stalled receive and polls at once when the browser is back online", async () => {
    let stalls = 1;
    server.use(
      http.get("*/receiveNotification/*", async () => {
        if (stalls-- <= 0) return; // falls through to the queue
        await delay("infinite");
        return new HttpResponse(null);
      }),
    );
    start();
    await vi.waitFor(() => {
      expect(received).toHaveLength(1);
    });
    queue({ receiptId: 1, body: textMessage });

    window.dispatchEvent(new Event("online"));

    await vi.waitFor(() => {
      expect(texts()).toEqual(["Привет-привет"]);
    });
  });

  // @regression — code review 3 F1: a poll that stalls with no `online` event recovers within 10 s
  it("gives up on a stalled receive after 8 s and saves the next reply within 10 s", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    let stalls = 1;
    server.use(
      http.get("*/receiveNotification/*", async () => {
        if (stalls-- <= 0) return; // falls through to the queue
        await delay("infinite");
        return new HttpResponse(null);
      }),
    );
    start();
    await flush();
    expect(received).toHaveLength(1);
    queue({ receiptId: 1, body: textMessage });

    // The 8 s budget, then the 1 s backoff, then an immediate answer.
    for (const ms of [8_000, 1_000, 1_000]) {
      await vi.advanceTimersByTimeAsync(ms);
      await flush();
    }

    expect(texts()).toEqual(["Привет-привет"]);
    expect(deleted).toEqual([1]);
  });

  it("cuts a backoff short when the browser is back online", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    queue(HttpResponse.error(), { receiptId: 1, body: textMessage });
    start();
    await flush();
    expect(received).toHaveLength(1);

    window.dispatchEvent(new Event("online"));
    await flush();

    expect(texts()).toEqual(["Привет-привет"]);
    expect(deleted).toEqual([1]);
  });

  it("stops listening for online once stopped", async () => {
    const add = vi.spyOn(window, "addEventListener");
    const remove = vi.spyOn(window, "removeEventListener");
    const { controller, done } = start();

    controller.abort();
    await done;

    const listener = add.mock.calls.find(([type]) => type === "online")?.[1];
    expect(listener).toBeDefined();
    expect(remove).toHaveBeenCalledWith("online", listener);
  });
});

const status = () => {
  const { keyInvalid, instanceState, noConnection, stuck } =
    useStatus.getState();
  return { keyInvalid, instanceState, noConnection, stuck };
};

/** Every condition on, as if each had been raised earlier in the session. */
const allRaised = () => {
  useStatus.setState({ keyInvalid: true, noConnection: true, stuck: true });
};

/** Advances fake time and lets MSW answer. */
async function advance(ms: number) {
  await vi.advanceTimersByTimeAsync(ms);
  await flush();
}

/** Receive never answers until `release()`; then it falls through to the queue. */
function stallReceive() {
  let stalled = true;
  server.use(
    http.get("*/receiveNotification/*", async () => {
      if (!stalled) return;
      await delay("infinite");
      return new HttpResponse(null);
    }),
  );
  return () => {
    stalled = false;
  };
}

// @spec: 005-connection-auth-states — one case per row of tech §2.2
describe("runReceiveLoop → status", () => {
  // @regression — tech §2.2 row 1: an empty poll is reachable and works
  it("clears no connection, the key and stuck on an empty poll", async () => {
    allRaised();
    queue(null);

    start();

    await vi.waitFor(() => {
      expect(status()).toMatchObject({
        keyInvalid: false,
        noConnection: false,
        stuck: false,
      });
    });
  });

  // @regression — tech §2.2 row 1, review F6: taken in but not cleared is reachable, not "works"
  it("clears no connection and the key on a notification, but stuck only once it is deleted", async () => {
    let answer = () => {};
    const gate = new Promise<void>((resolve) => {
      answer = resolve;
    });
    server.use(
      http.delete("*/deleteNotification/*/*", async () => {
        await gate; // then falls through to the queue's own DELETE
      }),
    );
    allRaised();
    queue({ receiptId: 1, body: textMessage });

    start();

    await vi.waitFor(() => {
      expect(deleted).toEqual([1]);
    });
    expect(status()).toMatchObject({
      keyInvalid: false,
      noConnection: false,
      stuck: true,
    });
    answer();
    await vi.waitFor(() => {
      expect(status().stuck).toBe(false);
    });
  });

  // @regression — tech §2.1: the fast path for the auth banner, then deleted as before
  it("sets the instance state from a stateInstanceChanged notification and deletes it", async () => {
    queue(
      { receiptId: 1, body: stateChanged("notAuthorized") },
      { receiptId: 2, body: stateChanged("rebooting") },
    );

    start();

    await vi.waitFor(() => {
      expect(deleted).toEqual([1, 2]);
    });
    expect(status().instanceState).toBe("notAuthorized");
    expect(Object.keys(useChats.getState().chats)).toEqual([]);

    queue({ receiptId: 3, body: stateChanged("authorized") });
    await vi.waitFor(() => {
      expect(status().instanceState).toBe("authorized");
    });
  });

  // @regression — tech §2.2 row 2, §3 risk 1: 401 and 403, confirmed by getStateInstance → the key
  // banner, never the stuck clock
  it.each([401, 403])(
    "marks the key invalid on %i, without starting the stuck clock",
    async (code) => {
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      server.use(
        http.get("*/receiveNotification/*", () => failure(code)),
        answer("getStateInstance", code),
      );

      start();
      await flush();
      expect(status().keyInvalid).toBe(true);
      await advance(70_000);

      expect(status()).toMatchObject({
        keyInvalid: true,
        noConnection: false,
        stuck: false,
      });
    },
  );

  // @regression — tech §3 risk 1: a logged-out instance may refuse receive like a bad key
  it("shows the instance state, not the key, when getStateInstance answers after a 401", async () => {
    server.use(stateIs("notAuthorized"));
    queue(failure(401));

    start();

    await vi.waitFor(() => {
      expect(status().instanceState).toBe("notAuthorized");
    });
    expect(status().keyInvalid).toBe(false);
    expect(requests).toEqual(["getStateInstance"]);
  });

  // @regression — tech §3 risk 1: a failed check keeps the conditions; the next cycle asks again
  it("keeps the conditions when the check after a 401 fails, and asks again on the next 401", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    server.use(answer("getStateInstance", 500));
    queue(failure(401), failure(401));

    start();
    await flush();
    expect(requests).toEqual(["getStateInstance"]);
    expect(status()).toMatchObject({
      keyInvalid: false,
      instanceState: "authorized",
      stuck: false,
    });

    server.use(answer("getStateInstance", 401));
    await advance(1_000);

    expect(requests).toEqual(["getStateInstance", "getStateInstance"]);
    expect(status().keyInvalid).toBe(true);
  });

  // @regression — tech §2.2 row 3: one network failure is not yet «Нет соединения»
  it("shows no connection after two network failures in a row, not one", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    queue(HttpResponse.error(), failure(500), HttpResponse.error());

    start();
    await flush();
    expect(status().noConnection).toBe(false);
    await advance(1_000); // the 500 breaks the streak
    await advance(2_000);
    expect(received).toHaveLength(3);
    expect(status().noConnection).toBe(false);

    queue(HttpResponse.error());
    await advance(4_000);
    expect(status().noConnection).toBe(true);
  });

  // @regression — tech §2.2 row 3, functional §2.2 c2: a stalled upstream → banner within 20 s
  it("counts a stalled poll's budget as a network failure: no connection after about 17 s", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    stallReceive();

    start();
    await advance(16_000);
    expect(status().noConnection).toBe(false);
    await advance(1_000);

    expect(status().noConnection).toBe(true);
    await advance(70_000);
    expect(status().stuck).toBe(false); // network failures never start the stuck clock
  });

  // @regression — tech §2.2 row 4, risk 5: an `online` wake must not flash «Нет соединения»
  it("polls again at once, without counting a failure, when woken by online", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    stallReceive();

    start();
    await flush();
    for (let i = 0; i < 3; i++) {
      window.dispatchEvent(new Event("online"));
      await flush();
    }

    expect(received).toHaveLength(4); // no backoff between them
    expect(status().noConnection).toBe(false);
  });

  // @regression — tech §2.2 row 5: 429, 5xx, badBody → the grey banner after 60 s, not before
  it("shows stuck after a minute of 429, 5xx and bad bodies, and clears it on an empty poll", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    let failing = true;
    let n = 0;
    const answers = [
      () => failure(429),
      () => failure(500),
      () => failure(503),
      () => HttpResponse.json({ body: {} }),
    ];
    server.use(
      http.get("*/receiveNotification/*", () =>
        failing ? answers[n++ % answers.length]() : undefined,
      ),
    );

    start();
    await advance(59_000);
    expect(status().stuck).toBe(false);
    await advance(1_000);
    expect(status()).toMatchObject({
      keyInvalid: false,
      noConnection: false,
      stuck: true,
    });

    failing = false;
    queue(null);
    await advance(5_000);
    expect(status().stuck).toBe(false);
  });

  // @regression — tech §2.2 row 5, functional §2.5 c2: a head that can't be deleted blocks the queue
  it("shows stuck when a received reply can't be deleted for a minute", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    server.use(http.delete("*/deleteNotification/*/*", () => failure(503)));
    queue({ receiptId: 1, body: textMessage });

    start();
    await advance(59_000);
    expect(status().stuck).toBe(false);
    await advance(1_000);

    expect(status().stuck).toBe(true);
    expect(texts()).toEqual(["Привет-привет"]);
  });

  // @regression — tech §2.2 row 5: a save that throws feeds the stuck clock too
  it("starts the stuck clock when saving a reply throws", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
    queue({ receiptId: 1, body: textMessage });

    start();
    await advance(60_000);

    expect(status().stuck).toBe(true);
    expect(deleted).toEqual([]);
  });

  // @regression — tech §2.2: the device's own events and state
  it("shows no connection at once on offline, and at start when the device is offline", async () => {
    stallReceive();
    start();
    await flush();

    window.dispatchEvent(new Event("offline"));
    expect(status().noConnection).toBe(true);
    window.dispatchEvent(new Event("online"));
    await flush();
    expect(status().noConnection).toBe(true); // only an answer clears it

    for (const loop of loops.splice(0)) loop.abort();
    useStatus.getState().reset();
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    start();
    expect(status().noConnection).toBe(true);
  });

  // @regression — tech §2.2: no writes once the session is over
  it("writes nothing after it stops: neither a pending stuck timer nor a late answer", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    server.use(http.get("*/receiveNotification/*", () => failure(500)));
    const first = start();
    await advance(30_000);
    first.controller.abort();
    await first.done;
    await advance(60_000);
    expect(status().stuck).toBe(false);

    let answer = () => {};
    const gate = new Promise<void>((resolve) => {
      answer = resolve;
    });
    server.use(
      http.get("*/receiveNotification/*", async () => {
        await gate;
        return failure(401);
      }),
    );
    const second = start();
    await flush();
    useChats.getState().wipe(); // logout
    window.dispatchEvent(new Event("offline"));
    answer();
    await advance(10_000);

    expect(status()).toMatchObject({ keyInvalid: false, noConnection: false });
    second.controller.abort();
    await second.done;
  });
});

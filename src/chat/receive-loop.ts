import {
  GreenApiError,
  deleteNotification,
  receiveNotification,
  type Credentials,
} from "../api/green-api";
import { useChats } from "./chats-store";
import { toIncoming, toStateChange } from "./notification";
import { useStatus, type StatusState } from "./status-store";

const RECEIVE_TIMEOUT_S = 5;
/** The long poll plus 3 s: a poll stalled by an upstream cut recovers within 10 s (review 3 F1). */
const RECEIVE_BUDGET_MS = 8_000;
const DELETE_BUDGET_MS = 15_000;
/** Then 5 s for ever. */
const BACKOFF_MS = [1_000, 2_000, 4_000, 5_000];
/** Failures other than network or key for this long → the grey banner (functional §2.5). */
const STUCK_AFTER_MS = 60_000;
/** Network failures in a row → «Нет соединения» (tech §2.2). */
const OFFLINE_AFTER = 2;

/** Which condition a failed receive or delete feeds (tech §2.2); a wake is handled before. */
function classify(error: unknown): "network" | "key" | "stuck" {
  if (error instanceof GreenApiError) {
    // `timeout` here is the time budget: a wake or an abort was ruled out by the caller.
    if (error.kind === "network" || error.kind === "timeout") return "network";
    if (error.status === 401 || error.status === 403) return "key";
  }
  return "stuck";
}

/** Runs `call` with a signal that aborts after `timeoutMs` or when `cancel` aborts. */
async function within<T>(
  timeoutMs: number,
  cancel: AbortSignal,
  call: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const abort = () => {
    controller.abort();
  };
  const timer = setTimeout(abort, timeoutMs);
  cancel.addEventListener("abort", abort);
  if (cancel.aborted) abort();
  try {
    return await call(controller.signal);
  } finally {
    clearTimeout(timer);
    cancel.removeEventListener("abort", abort);
  }
}

/** Waits `ms`, or less if `cancel` aborts. */
function sleep(ms: number, cancel: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      cancel.removeEventListener("abort", done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    cancel.addEventListener("abort", done);
    if (cancel.aborted) done();
  });
}

/**
 * Takes replies off GREEN-API's notification queue one at a time until `signal` aborts or the
 * chats session changes (logout): receive → save → delete (tech §2.4). Classifies every answer
 * into the status store (spec 005 tech §2.2). Never rejects.
 */
export async function runReceiveLoop(
  credentials: Credentials,
  signal: AbortSignal,
): Promise<void> {
  const session = useChats.getState().session;
  const stopped = () =>
    signal.aborted || useChats.getState().session !== session;

  // Aborted by `online` or by `signal`: cancels the current request or backoff sleep.
  let wake = new AbortController();
  const onWake = () => {
    wake.abort();
  };
  // No writes once the session is over: a late answer can't raise a banner on the sign-in screen.
  const write = (patch: Partial<StatusState>) => {
    if (!stopped()) useStatus.setState(patch);
  };
  const onOffline = () => {
    write({ noConnection: true });
  };
  window.addEventListener("online", onWake);
  window.addEventListener("offline", onOffline);
  signal.addEventListener("abort", onWake);
  if (!navigator.onLine) onOffline();

  let failures = 0;
  const backOff = () =>
    sleep(BACKOFF_MS[Math.min(failures++, BACKOFF_MS.length - 1)], wake.signal);

  let networkFailures = 0;
  let stuckTimer: ReturnType<typeof setTimeout> | undefined;
  const reachable = () => {
    networkFailures = 0;
    write({ noConnection: false, keyInvalid: false });
  };
  // Only an empty poll or a successful delete: a reply taken in but never cleared is not "works".
  const works = () => {
    reachable();
    clearTimeout(stuckTimer);
    stuckTimer = undefined;
    write({ stuck: false });
  };
  const fail = (error: unknown) => {
    const kind = classify(error);
    if (kind === "network") {
      if (++networkFailures >= OFFLINE_AFTER) write({ noConnection: true });
      return;
    }
    networkFailures = 0;
    if (kind === "key") write({ keyInvalid: true });
    // Started by the first such failure, never restarted by the next ones.
    else
      stuckTimer ??= setTimeout(() => {
        write({ stuck: true });
      }, STUCK_AFTER_MS);
  };

  try {
    while (!stopped()) {
      if (wake.signal.aborted) wake = new AbortController();
      let notification;
      try {
        notification = await within(RECEIVE_BUDGET_MS, wake.signal, (s) =>
          receiveNotification(credentials, RECEIVE_TIMEOUT_S, s),
        );
      } catch (error) {
        // Woken by `online` or stopped: not a failure, poll again at once.
        if (wake.signal.aborted) continue;
        fail(error);
        await backOff();
        continue;
      }
      if (notification === null) {
        failures = 0;
        works();
        continue;
      }
      reachable();
      // Before saving and so before deleting: a notification received just before logout stays
      // queued for the next sign-in.
      if (stopped()) return;
      const state = toStateChange(notification.body);
      if (state !== null) write({ instanceState: state });
      const incoming = toIncoming(notification.body);
      // Synchronous: localStorage is written before the delete goes out. A save that throws (a full
      // localStorage) keeps the notification queued: it comes back after the backoff (review F1).
      try {
        if (incoming !== null) useChats.getState().receive(incoming);
      } catch (error) {
        fail(error);
        await backOff();
        continue;
      }
      const { receiptId } = notification;
      try {
        await within(DELETE_BUDGET_MS, wake.signal, (s) =>
          deleteNotification(credentials, receiptId, s),
        );
        failures = 0;
        works();
      } catch (error) {
        // The head stays queued and comes back; dedupe absorbs it. Only a delete resets the backoff,
        // so a delete that keeps failing never loops hot.
        if (wake.signal.aborted) continue;
        fail(error);
        await backOff();
      }
    }
  } finally {
    clearTimeout(stuckTimer);
    window.removeEventListener("online", onWake);
    window.removeEventListener("offline", onOffline);
    signal.removeEventListener("abort", onWake);
  }
}

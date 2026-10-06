import {
  deleteNotification,
  receiveNotification,
  type Credentials,
} from "../api/green-api";
import { useChats } from "./chats-store";
import { toIncoming } from "./notification";

const RECEIVE_TIMEOUT_S = 5;
/** The long poll plus 3 s: a poll stalled by an upstream cut recovers within 10 s (review 3 F1). */
const RECEIVE_BUDGET_MS = 8_000;
const DELETE_BUDGET_MS = 15_000;
/** Then 5 s for ever. */
const BACKOFF_MS = [1_000, 2_000, 4_000, 5_000];

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
 * chats session changes (logout): receive → save → delete (tech §2.4). Never rejects.
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
  window.addEventListener("online", onWake);
  signal.addEventListener("abort", onWake);

  let failures = 0;
  const backOff = () =>
    sleep(BACKOFF_MS[Math.min(failures++, BACKOFF_MS.length - 1)], wake.signal);

  try {
    while (!stopped()) {
      if (wake.signal.aborted) wake = new AbortController();
      let notification;
      try {
        notification = await within(RECEIVE_BUDGET_MS, wake.signal, (s) =>
          receiveNotification(credentials, RECEIVE_TIMEOUT_S, s),
        );
      } catch {
        await backOff();
        continue;
      }
      if (notification === null) {
        failures = 0;
        continue;
      }
      // Before saving and so before deleting: a notification received just before logout stays
      // queued for the next sign-in.
      if (stopped()) return;
      const incoming = toIncoming(notification.body);
      // Synchronous: localStorage is written before the delete goes out. A save that throws (a full
      // localStorage) keeps the notification queued: it comes back after the backoff (review F1).
      try {
        if (incoming !== null) useChats.getState().receive(incoming);
      } catch {
        await backOff();
        continue;
      }
      const { receiptId } = notification;
      try {
        await within(DELETE_BUDGET_MS, wake.signal, (s) =>
          deleteNotification(credentials, receiptId, s),
        );
        failures = 0;
      } catch {
        // The head stays queued and comes back; dedupe absorbs it. Only a delete resets the backoff,
        // so a delete that keeps failing never loops hot.
        await backOff();
      }
    }
  } finally {
    window.removeEventListener("online", onWake);
    signal.removeEventListener("abort", onWake);
  }
}

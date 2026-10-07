import {
  GreenApiError,
  deleteNotification,
  receiveNotification,
  type Credentials,
} from "../api/green-api";
import { useChats } from "./chats-store";
import { toIncoming, toStateChange } from "./notification";
import { askState } from "./state-watch";
import { useStatus, type StatusState } from "./status-store";
import { sleep, within } from "./wait";

const RECEIVE_TIMEOUT_S = 5;
/** The long poll plus 3 s: a poll stalled by an upstream cut recovers within 10 s (review 3 F1). */
const RECEIVE_BUDGET_MS = 8_000;
/** As the receive's, so an outage that starts during a delete shows within 20 s (code review F2). */
const DELETE_BUDGET_MS = 8_000;
/** Then 5 s for ever. */
const BACKOFF_MS = [1_000, 2_000, 4_000, 5_000];
/** Failures other than network or key for this long → the grey banner (functional §2.5). */
const STUCK_AFTER_MS = 60_000;
/**
 * No answer from GREEN-API for this long while the latest failure is a network one → «Нет
 * соединения», whatever the backoff or a tie-break check is doing: within 20 s (tech Round 2).
 */
const OFFLINE_AFTER_MS = 15_000;

/** Which condition a failed call feeds (tech §2.2); a wake is handled before. */
function classify(error: unknown): "network" | "key" | "stuck" {
  if (error instanceof GreenApiError) {
    // `timeout` here is the time budget: a wake or an abort was ruled out by the caller.
    if (error.kind === "network" || error.kind === "timeout") return "network";
    if (error.status === 401 || error.status === 403) return "key";
  }
  return "stuck";
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

  // The latest failure is a network one, and no HTTP answer has come for OFFLINE_AFTER_MS.
  let networkDown = false;
  let silent = false;
  let silenceTimer: ReturnType<typeof setTimeout> | undefined;
  const listen = () => {
    clearTimeout(silenceTimer);
    silent = false;
    silenceTimer = setTimeout(() => {
      silent = true;
      if (networkDown) write({ noConnection: true });
    }, OFFLINE_AFTER_MS);
  };
  listen();
  const networkFailed = () => {
    networkDown = true;
    if (silent) write({ noConnection: true });
  };
  // Any HTTP answer, 429 and 5xx too: GREEN-API can be reached (tech Round 2).
  const answered = () => {
    networkDown = false;
    listen();
    write({ noConnection: false });
  };
  const reachable = () => {
    answered();
    write({ keyInvalid: false });
  };
  let stuckTimer: ReturnType<typeof setTimeout> | undefined;
  // Only an empty poll or a successful delete: a reply taken in but never cleared is not "works".
  const works = () => {
    reachable();
    clearTimeout(stuckTimer);
    stuckTimer = undefined;
    write({ stuck: false });
  };
  // Started by the first such failure, never restarted by the next ones.
  const startStuck = () => {
    stuckTimer ??= setTimeout(() => {
      write({ stuck: true });
    }, STUCK_AFTER_MS);
  };
  const isAnswer = (error: unknown) =>
    error instanceof GreenApiError &&
    (error.kind === "http" || error.kind === "badBody");
  const fail = async (error: unknown) => {
    const kind = classify(error);
    if (kind === "network") {
      networkFailed();
      return;
    }
    networkDown = false;
    if (isAnswer(error)) answered();
    if (kind === "key") {
      if (stopped()) return;
      // A logged-out instance may refuse the same way: only its state tells the two apart
      // (tech §3 risk 1).
      let patch;
      try {
        patch = await askState(credentials, wake.signal);
      } catch (checkError) {
        // Woken or stopped: not a failure.
        if (wake.signal.aborted) return;
        // The conditions stay and the next cycle asks again, but receiving is refused all the
        // same (tech Round 2).
        if (classify(checkError) === "network") networkFailed();
        else answered();
        startStuck();
        return;
      }
      answered();
      write(patch);
      // The key works and the instance is authorized, yet receiving is refused (code review F3).
      if (patch.instanceState === "authorized") startStuck();
      return;
    }
    startStuck();
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
        await fail(error);
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
        await fail(error);
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
        // The receive just got through, so a network failure here is a head taken in but not
        // cleared (code review F1). It is still the latest failure: an outage that starts here
        // shows 15 s after the receive's answer (F2); the next receive that gets through resets it.
        if (classify(error) === "network") startStuck();
        await fail(error);
        await backOff();
      }
    }
  } finally {
    clearTimeout(stuckTimer);
    clearTimeout(silenceTimer);
    window.removeEventListener("online", onWake);
    window.removeEventListener("offline", onOffline);
    signal.removeEventListener("abort", onWake);
  }
}

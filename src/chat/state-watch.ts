import {
  GreenApiError,
  getStateInstance,
  type Credentials,
} from "../api/green-api";
import { useChats } from "./chats-store";
import { isInstanceState } from "./notification";
import { useStatus, type StatusState } from "./status-store";
import { sleep, within } from "./wait";

const CHECK_BUDGET_MS = 15_000;
/** The first check too: sign-in's own `getStateInstance` is long done (1 rps limit). */
const WATCH_EVERY_MS = 4 * 60_000;
/** After a failed check, so the 5-minute bound holds while GREEN-API can be reached (review 3 F2). */
const RETRY_EVERY_MS = 30_000;

/**
 * One `getStateInstance` as a status patch (tech §2.2, watch column); a 401/403 is the key.
 * Throws on any other failure (timeout, 429, 5xx, network, an abort of `cancel`).
 */
export async function askState(
  credentials: Credentials,
  cancel: AbortSignal,
): Promise<Partial<StatusState>> {
  try {
    const { stateInstance } = await within(CHECK_BUDGET_MS, cancel, (s) =>
      getStateInstance(credentials, s),
    );
    return {
      noConnection: false,
      keyInvalid: false,
      ...(isInstanceState(stateInstance)
        ? { instanceState: stateInstance }
        : {}),
    };
  } catch (error) {
    if (
      error instanceof GreenApiError &&
      (error.status === 401 || error.status === 403)
    ) {
      return { keyInvalid: true };
    }
    throw error;
  }
}

/** As `askState`, but `null` when it failed: the caller keeps the current conditions. */
export async function checkState(
  credentials: Credentials,
  cancel: AbortSignal,
): Promise<Partial<StatusState> | null> {
  try {
    return await askState(credentials, cancel);
  } catch {
    return null;
  }
}

/**
 * Checks the instance state every 4 minutes, every 30 s after a failed check, until `signal`
 * aborts or the chats session changes (tech §2.1): the bound for a logout when `stateWebhook`
 * is off. Never rejects.
 */
export async function watchInstanceState(
  credentials: Credentials,
  signal: AbortSignal,
): Promise<void> {
  const session = useChats.getState().session;
  const stopped = () =>
    signal.aborted || useChats.getState().session !== session;

  let wait = WATCH_EVERY_MS;
  for (;;) {
    await sleep(wait, signal);
    if (stopped()) return;
    const patch = await checkState(credentials, signal);
    // No writes once the session is over.
    if (stopped()) return;
    if (patch !== null) useStatus.setState(patch);
    wait = patch === null ? RETRY_EVERY_MS : WATCH_EVERY_MS;
  }
}

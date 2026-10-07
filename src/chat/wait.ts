/** Runs `call` with a signal that aborts after `timeoutMs` or when `cancel` aborts. */
export async function within<T>(
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
export function sleep(ms: number, cancel: AbortSignal): Promise<void> {
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

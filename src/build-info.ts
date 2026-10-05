// Injected by `define` in vite.config.ts from GITHUB_SHA; both are null when it is unset (local dev/build).
// Declared here, not globally, so this module stays their only reader.
declare const __APP_COMMIT__: string | null;
declare const __APP_BUILT_AT__: string | null;

export interface BuildInfo {
  /** First 7 chars of the commit SHA, as GitHub shows it. */
  commit: string | null;
  /** ISO 8601 build time in UTC, e.g. `2026-10-05T14:25:31.000Z`. */
  builtAt: string | null;
}

export const BUILD_INFO: BuildInfo = {
  commit: __APP_COMMIT__,
  builtAt: __APP_BUILT_AT__,
};

/** `abc1234 · 2026-10-05 14:25 UTC`, or `local` when either part is missing. */
export function formatVersion({ commit, builtAt }: BuildInfo): string {
  if (commit === null || builtAt === null) return "local";
  // Plain string slicing: no locale or timezone formatting, so every visitor sees the same UTC label.
  return `${commit} · ${builtAt.slice(0, 16).replace("T", " ")} UTC`;
}

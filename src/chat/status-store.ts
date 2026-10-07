import { create } from "zustand";

/** The one banner shown, by priority (functional §2.1). */
export type BannerKind = "key" | "auth" | "offline" | "stuck";

export interface StatusState {
  /** GREEN-API stopped accepting the access key (functional §2.4). */
  keyInvalid: boolean;
  /** The last known `stateInstance`; anything but `authorized` shows the auth banner. */
  instanceState: string;
  noConnection: boolean;
  /** Receiving has kept failing for a minute (functional §2.5). */
  stuck: boolean;
  reset: () => void;
}

const INITIAL = {
  keyInvalid: false,
  instanceState: "authorized",
  noConnection: false,
  stuck: false,
};

/** Connection and authorization state for this session; never persisted (tech §2.3). */
export const useStatus = create<StatusState>()((set) => ({
  ...INITIAL,
  reset: () => {
    set(INITIAL);
  },
}));

export function bannerOf(s: StatusState): BannerKind | null {
  if (s.keyInvalid) return "key";
  if (s.instanceState !== "authorized") return "auth";
  if (s.noConnection) return "offline";
  if (s.stuck) return "stuck";
  return null;
}

/** Why sending is paused, or `null`; the grey "stuck" banner doesn't pause it. */
export function pausedBy(s: StatusState): Exclude<BannerKind, "stuck"> | null {
  const banner = bannerOf(s);
  return banner === "stuck" ? null : banner;
}

// @layer: unit
// @spec: 005-connection-auth-states
import { afterEach, describe, expect, it } from "vitest";
import {
  bannerOf,
  pausedBy,
  useStatus,
  type StatusState,
} from "./status-store";

const bools = [false, true];
const combinations = bools.flatMap((keyInvalid) =>
  bools.flatMap((notAuthorized) =>
    bools.flatMap((noConnection) =>
      bools.map((stuck) => ({
        keyInvalid,
        instanceState: notAuthorized ? "notAuthorized" : "authorized",
        noConnection,
        stuck,
        reset: () => {},
      })),
    ),
  ),
);

/** The expected banner, written out by priority (functional §2.1). */
function expected(s: StatusState) {
  if (s.keyInvalid) return "key";
  if (s.instanceState !== "authorized") return "auth";
  if (s.noConnection) return "offline";
  return s.stuck ? "stuck" : null;
}

afterEach(() => {
  useStatus.getState().reset();
});

describe("bannerOf", () => {
  // @regression — functional §2.1: one banner, key > auth > offline > stuck
  it.each(combinations.map((s) => [JSON.stringify(s), s] as const))(
    "%s",
    (_, s) => {
      expect(bannerOf(s)).toBe(expected(s));
    },
  );

  it("treats every state but authorized as the auth banner", () => {
    for (const instanceState of ["blocked", "sleepMode", "starting"]) {
      expect(bannerOf({ ...useStatus.getState(), instanceState })).toBe("auth");
    }
  });
});

describe("pausedBy", () => {
  // @regression — functional §2.6: the grey banner doesn't pause sending
  it.each(combinations.map((s) => [JSON.stringify(s), s] as const))(
    "%s",
    (_, s) => {
      const banner = expected(s);
      expect(pausedBy(s)).toBe(banner === "stuck" ? null : banner);
    },
  );
});

describe("useStatus", () => {
  it("starts clear and resets to clear", () => {
    expect(bannerOf(useStatus.getState())).toBeNull();
    useStatus.setState({
      keyInvalid: true,
      instanceState: "blocked",
      noConnection: true,
      stuck: true,
    });

    useStatus.getState().reset();

    expect(useStatus.getState()).toMatchObject({
      keyInvalid: false,
      instanceState: "authorized",
      noConnection: false,
      stuck: false,
    });
  });
});

// @layer: unit
// @spec: 001-project-skeleton-first-deploy
import { describe, expect, it } from "vitest";
import { formatVersion } from "./build-info";

// Functional §2.1 c1 / §2.2 c1: the label is the short code GitHub shows plus the UTC build time.
// Functional §2.5 c2: a build without a commit (local) reads "local".
describe("formatVersion", () => {
  // @regression
  it("shows the short commit code and the build date and time to the minute in UTC", () => {
    expect(
      formatVersion({ commit: "abc1234", builtAt: "2026-10-05T14:25:31.000Z" }),
    ).toBe("abc1234 · 2026-10-05 14:25 UTC");
  });

  // @regression
  it("truncates seconds instead of rounding them up to the next minute", () => {
    expect(
      formatVersion({ commit: "48aecc4", builtAt: "2026-10-05T15:38:59.999Z" }),
    ).toBe("48aecc4 · 2026-10-05 15:38 UTC");
  });

  // @regression
  it("never converts to the visitor's time zone, even across a year boundary", () => {
    // A locale/timezone formatter would show 2026-12-31 for any visitor west of UTC.
    expect(
      formatVersion({ commit: "0000000", builtAt: "2027-01-01T00:00:00.000Z" }),
    ).toBe("0000000 · 2027-01-01 00:00 UTC");
  });

  // @regression
  it("reads local when there is no commit", () => {
    expect(formatVersion({ commit: null, builtAt: null })).toBe("local");
  });

  it("reads local when only the build time is missing", () => {
    expect(formatVersion({ commit: "abc1234", builtAt: null })).toBe("local");
  });

  it("reads local when only the commit is missing", () => {
    expect(
      formatVersion({ commit: null, builtAt: "2026-10-05T14:25:31.000Z" }),
    ).toBe("local");
  });
});

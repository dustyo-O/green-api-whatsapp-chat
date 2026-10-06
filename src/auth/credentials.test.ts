// @layer: unit
// @spec: 002-sign-in-session
import { describe, expect, it } from "vitest";
import {
  EMPTY_FORM,
  canSubmit,
  deriveApiUrl,
  isValidApiUrl,
  isValidIdInstance,
  normalize,
} from "./credentials";

describe("deriveApiUrl", () => {
  // @regression — functional §2.1 c1: API URL from the first four digits, empty until then
  it.each([
    ["7103123456", "https://7103.api.greenapi.com"],
    ["  1101000000 ", "https://1101.api.greenapi.com"],
    ["7103", "https://7103.api.greenapi.com"],
    ["710", ""],
    ["71a3123456", ""],
    ["", ""],
  ])("%j → %j", (id, url) => {
    expect(deriveApiUrl(id)).toBe(url);
  });
});

describe("normalize", () => {
  // @regression — functional §2.1: spaces at the start and end are ignored
  it("trims every field and derives the API URL when it is not custom", () => {
    expect(
      normalize({
        idInstance: " 7103123456 ",
        apiTokenInstance: "\ttoken ",
        apiUrl: "https://ignored.example",
        customApiUrl: false,
      }),
    ).toEqual({
      idInstance: "7103123456",
      apiTokenInstance: "token",
      apiUrl: "https://7103.api.greenapi.com",
      customApiUrl: false,
    });
  });

  it("keeps a custom API URL, trimmed and without trailing slashes", () => {
    expect(
      normalize({
        ...EMPTY_FORM,
        idInstance: "7103123456",
        apiUrl: "  https://custom.example// ",
        customApiUrl: true,
      }).apiUrl,
    ).toBe("https://custom.example");
  });
});

describe("validation", () => {
  // @regression — functional §2.1 c3
  it.each([
    ["7103123456", true],
    ["7103a", false],
    ["71 03", false],
    ["", false],
  ])("idInstance %j valid: %s", (id, valid) => {
    expect(isValidIdInstance(id)).toBe(valid);
  });

  // @regression — functional §2.1 c4: a plain https address only
  it.each([
    ["https://7103.api.greenapi.com", true],
    ["https://7103.api.greenapi.com/", true],
    ["https://localhost:8443", true],
    ["https://", false],
    ["https:", false],
    ["http://x", false],
    ["7103.api.greenapi.com", false],
    ["https://x/base", false],
    ["https://x?y", false],
    ["https://x?", false],
    ["https://x/#y", false],
    ["https://user:pass@x", false],
  ])("API URL %j valid: %s", (url, valid) => {
    expect(isValidApiUrl(url)).toBe(valid);
  });

  it("allows submitting only digits, a token and a plain https address", () => {
    const ok = normalize({
      ...EMPTY_FORM,
      idInstance: "7103123456",
      apiTokenInstance: "token",
    });
    expect(canSubmit(ok)).toBe(true);
    expect(canSubmit({ ...ok, apiTokenInstance: "" })).toBe(false);
    expect(canSubmit({ ...ok, idInstance: "7103a" })).toBe(false);
    expect(canSubmit({ ...ok, apiUrl: "https:" })).toBe(false);
  });
});

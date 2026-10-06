// @layer: unit
// @spec: 003-chats-sending
import { describe, expect, it } from "vitest";
import {
  COUNTRIES,
  cleanNumber,
  formatTitle,
  isValidCode,
  isValidNumber,
  toChatId,
} from "./phone";

describe("COUNTRIES", () => {
  // @regression — functional §2.1: the short list in the spec's order, Россия first
  it("lists the spec's countries in order, then «Другая страна»", () => {
    expect(COUNTRIES.map((c) => `${c.flag} ${c.name} +${c.code}`)).toEqual([
      "🇷🇺 Россия +7",
      "🇰🇿 Казахстан +7",
      "🇧🇾 Беларусь +375",
      "🇺🇦 Украина +380",
      "🇺🇿 Узбекистан +998",
      "🇦🇲 Армения +374",
      "🇬🇪 Грузия +995",
      "🇷🇸 Сербия +381",
      "🇹🇷 Турция +90",
      "🇩🇪 Германия +49",
      "🇺🇸 США +1",
      " Другая страна +",
    ]);
  });

  it("gives every country its own id", () => {
    expect(new Set(COUNTRIES.map((c) => c.id)).size).toBe(COUNTRIES.length);
  });
});

describe("cleanNumber", () => {
  it.each([
    ["903 747-44-11", "9037474411"],
    ["(903) 747 44 11", "9037474411"],
    ["  9037474411 ", "9037474411"],
    ["9O3", "9O3"],
  ])("%j → %j", (input, expected) => {
    expect(cleanNumber(input)).toBe(expected);
  });
});

describe("isValidNumber", () => {
  // @regression — functional §2.1: digits only once cleaned, at least one, no length check
  it.each([
    ["903 747-44-11", true],
    ["(903) 747-44-11", true],
    ["1", true],
    ["123", true],
    ["", false],
    [" - () ", false],
    ["abc", false],
    ["903abc", false],
    ["+79037474411", false],
    ["903.747", false],
  ])("%j → %s", (input, expected) => {
    expect(isValidNumber(input)).toBe(expected);
  });
});

describe("isValidCode", () => {
  it.each([
    ["381", true],
    ["1", true],
    ["", false],
    ["+381", false],
    ["38 1", false],
    ["abc", false],
  ])("%j → %s", (input, expected) => {
    expect(isValidCode(input)).toBe(expected);
  });
});

describe("toChatId", () => {
  it.each([
    ["7", "903 747-44-11", "79037474411@c.us"],
    ["381", "629443720", "381629443720@c.us"],
    ["7", "123", "7123@c.us"],
  ])("%s + %j → %s", (code, number, expected) => {
    expect(toChatId(code, number)).toBe(expected);
  });
});

describe("formatTitle", () => {
  // @regression — functional §2.2: +7 numbers formatted, all others `+` and the digits
  it.each([
    ["79037474411@c.us", "+7 903 747-44-11"],
    ["381629443720@c.us", "+381629443720"],
    ["7123@c.us", "+7123"],
    ["790374744111@c.us", "+790374744111"],
    ["4915112345678@c.us", "+4915112345678"],
  ])("%s → %s", (chatId, expected) => {
    expect(formatTitle(chatId)).toBe(expected);
  });
});

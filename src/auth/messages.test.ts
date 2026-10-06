// @layer: unit
// @spec: 002-sign-in-session
import { describe, expect, it } from "vitest";
import { checkErrorMessage } from "./messages";

describe("checkErrorMessage", () => {
  // @regression — functional §2.2 c3
  it("names the API URL that could not be reached", () => {
    expect(
      checkErrorMessage("unreachable", "https://7103.api.greenapi.com"),
    ).toBe(
      "Не удалось связаться с https://7103.api.greenapi.com. Проверьте API URL в консоли GREEN-API и подключение к интернету.",
    );
  });

  // @regression — functional §2.2 messages table
  it("uses the functional spec's texts verbatim", () => {
    expect(checkErrorMessage("wrongCredentials", "https://x")).toBe(
      "Неверный idInstance или apiTokenInstance.",
    );
    expect(checkErrorMessage("unknown", "https://x")).toBe(
      "Не удалось проверить инстанс. Попробуйте ещё раз.",
    );
  });
});

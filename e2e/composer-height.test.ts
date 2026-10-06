// @vitest-environment node
// @layer: e2e
// @spec: 003-chats-sending
//
// Functional §2.3 c6 (the box grows up to 6 lines, then scrolls) is layout, which jsdom doesn't
// have. The real-browser check proved it once (docs/screenshots/003-composer-6-lines.png); this
// guards the CSS it rests on (tech §2.7).
import { describe, expect, it } from "vitest";
import { readProjectFile } from "./support";

const BOX = /\.box\s*\{([^}]*)\}/.exec(
  readProjectFile("src/chat/Composer.module.css"),
)?.[1];

describe("§2.3 the message box", () => {
  // @regression — functional §2.3 c6
  it("grows with the text, stops at 6 lines and scrolls inside", () => {
    expect(BOX).toMatch(/field-sizing:\s*content;/);
    expect(BOX).toMatch(/max-height:\s*calc\(6lh\b/);
    expect(BOX).toMatch(/overflow-y:\s*auto;/);
  });
});

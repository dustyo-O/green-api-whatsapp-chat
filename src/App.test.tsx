import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App";

// Build info is always passed explicitly: CI sets GITHUB_SHA during `npm run check`,
// so the real BUILD_INFO differs between local runs and CI.
describe("App", () => {
  it("shows the app name, the skeleton note and the commit with its UTC build time", () => {
    render(
      <App
        build={{ commit: "abc1234", builtAt: "2026-10-05T14:25:31.000Z" }}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "GREEN-API WhatsApp Chat" }),
    ).toBeDefined();
    expect(screen.getByText(/early skeleton/i)).toBeDefined();
    const label = screen.getByText("abc1234 · 2026-10-05 14:25 UTC");
    expect(label.tagName).toBe("TIME");
    expect(label.getAttribute("datetime")).toBe("2026-10-05T14:25:31.000Z");
  });

  it("labels a local build as local", () => {
    render(<App build={{ commit: null, builtAt: null }} />);

    expect(screen.getByText("local")).toBeDefined();
  });
});

// @layer: integration
// @spec: 001-project-skeleton-first-deploy
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App";

const PUBLISHED = { commit: "abc1234", builtAt: "2026-10-05T14:25:31.000Z" };
const LOCAL = { commit: null, builtAt: null };

// Build info is always passed explicitly: CI sets GITHUB_SHA during `npm run check`,
// so the real BUILD_INFO differs between local runs and CI.
describe("App", () => {
  // @regression — functional §2.1 c1
  it("shows the app name, the skeleton note and the commit with its UTC build time", () => {
    render(<App build={PUBLISHED} />);

    expect(
      screen.getByRole("heading", { name: "GREEN-API WhatsApp Chat" }),
    ).toBeDefined();
    expect(screen.getByText(/early skeleton/i)).toBeDefined();
    expect(screen.getByText(/chat is not available yet/i)).toBeDefined();
    const label = screen.getByText("abc1234 · 2026-10-05 14:25 UTC");
    expect(label.tagName).toBe("TIME");
    expect(label.getAttribute("datetime")).toBe("2026-10-05T14:25:31.000Z");
  });

  // @regression — functional §2.5 c2
  it("labels a local build as local", () => {
    render(<App build={LOCAL} />);

    expect(screen.getByText("local")).toBeDefined();
  });

  // @regression — functional §2.5 c2: "everything else on the page matches the public page"
  it("renders a local build exactly like the published page except for the version label", () => {
    const published = render(<App build={PUBLISHED} />);
    const publishedText = published.container.textContent;
    published.unmount();

    const local = render(<App build={LOCAL} />);

    expect(local.container.textContent).toBe(
      publishedText.replace("abc1234 · 2026-10-05 14:25 UTC", "local"),
    );
    expect(
      screen.getByRole("heading", { name: "GREEN-API WhatsApp Chat" }),
    ).toBeDefined();
  });

  it("does not present a local label as a machine-readable build time", () => {
    const { container } = render(<App build={LOCAL} />);

    expect(container.querySelector("time")).toBeNull();
  });

  it("falls back to local instead of showing a half-known version", () => {
    const { container } = render(
      <App build={{ commit: "abc1234", builtAt: null }} />,
    );

    expect(screen.getByText("local")).toBeDefined();
    expect(container.textContent).not.toContain("abc1234");
    expect(container.textContent).not.toContain("null");
  });
});

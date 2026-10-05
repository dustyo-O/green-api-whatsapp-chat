// @layer: integration
// @spec: 001-project-skeleton-first-deploy
import { screen } from "@testing-library/react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import indexHtml from "../index.html?raw";
import { BUILD_INFO, formatVersion } from "./build-info";

// The real page shell: index.html's <body> as the browser parses it, before any script runs.
function mountIndexHtml() {
  const doc = new DOMParser().parseFromString(indexHtml, "text/html");
  document.title = doc.title;
  document.body.innerHTML = doc.body.innerHTML;
}

async function boot() {
  await act(async () => {
    await import("./main");
  });
}

describe("index.html + main.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    // main.tsx owns its React root; dropping the container is enough between tests.
    document.body.innerHTML = "";
  });

  // @regression — functional §2.1 c1/c2: opening the page shows its content, never a blank page
  it("renders the page into index.html's root with the build's own version label", async () => {
    mountIndexHtml();

    await boot();

    expect(document.title).toBe("GREEN-API WhatsApp Chat");
    expect(
      screen.getByRole("heading", { name: "GREEN-API WhatsApp Chat" }),
    ).toBeDefined();
    expect(screen.getByRole("button", { name: "Войти" })).toBeDefined();
    // Whatever this run injected (null locally, GITHUB_SHA in CI), the page shows exactly that.
    expect(screen.getByText(formatVersion(BUILD_INFO))).toBeDefined();
  });

  // @regression — functional §2.1 c2: without JavaScript the visitor still gets a message
  it("tells visitors without JavaScript why the page needs it", () => {
    const doc = new DOMParser().parseFromString(indexHtml, "text/html");

    expect(doc.querySelector("noscript")?.textContent).toMatch(
      /needs JavaScript/,
    );
  });

  it("fails loudly instead of rendering nothing when the root element is missing", async () => {
    document.body.innerHTML = "<div id='not-root'></div>";

    await expect(boot()).rejects.toThrow("#root element is missing");
  });
});

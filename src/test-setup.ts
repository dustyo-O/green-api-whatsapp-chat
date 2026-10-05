import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Vitest runs with `globals: false`, so RTL can't register its own auto-cleanup.
afterEach(() => {
  cleanup();
});

/// <reference types="vitest/config" />
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

// Actions sets GITHUB_SHA in every step; locally it is unset, so the page reads "local".
const sha = process.env.GITHUB_SHA;
const commit = sha ? sha.slice(0, 7) : null;
const builtAt = sha ? new Date().toISOString() : null;

// Writes <meta name="app-version"> so the live version can be checked with curl, without running JS.
function appVersionMeta(): Plugin {
  return {
    name: "app-version-meta",
    transformIndexHtml: () => [
      {
        tag: "meta",
        attrs: {
          name: "app-version",
          content:
            commit !== null && builtAt !== null
              ? `${commit} ${builtAt}`
              : "local",
        },
        injectTo: "head",
      },
    ],
  };
}

export default defineConfig({
  // GitHub Pages project site: https://dustyo-o.github.io/green-api-whatsapp-chat/
  base: "/green-api-whatsapp-chat/",
  plugins: [react(), appVersionMeta()],
  define: {
    __APP_COMMIT__: JSON.stringify(commit),
    __APP_BUILT_AT__: JSON.stringify(builtAt),
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
  },
});

// @vitest-environment node
// @layer: e2e
// @spec: 001-project-skeleton-first-deploy
//
// Builds the page exactly as CI's `check` job does (`vite build` with GITHUB_SHA set), serves the
// result under the GitHub Pages base path and reads it over HTTP, the way `curl` and a visitor see
// it. Browser-driven checks are out of scope for this spec; the lead checks the live site.
import { join } from "node:path";
import { preview, type PreviewServer } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BASE_PATH, ROOT, machineEnv, makeTempDir, run } from "./support";

const GITHUB_SHA = "48aecc4f0e1d2c3b4a5968778695a4b3c2d1e0f9";
const SHORT_SHA = "48aecc4";

interface ServedBuild {
  baseUrl: string;
  get: (path: string) => Promise<Response>;
  close: () => Promise<void>;
}

async function buildAndServe(env: NodeJS.ProcessEnv): Promise<ServedBuild> {
  const outDir = makeTempDir("dist");
  const result = run(
    process.execPath,
    [
      join(ROOT, "node_modules/vite/bin/vite.js"),
      "build",
      "--outDir",
      outDir.path,
      "--emptyOutDir",
    ],
    { env },
  );
  if (result.status !== 0) {
    outDir.remove();
    throw new Error(`vite build failed:\n${result.output}`);
  }

  const server: PreviewServer = await preview({
    root: ROOT,
    logLevel: "silent",
    build: { outDir: outDir.path },
    preview: { port: 0, host: "127.0.0.1", open: false },
  });
  const address = server.httpServer.address();
  if (address === null || typeof address === "string") {
    throw new Error("preview server has no TCP address");
  }
  const origin = `http://127.0.0.1:${String(address.port)}`;

  return {
    baseUrl: `${origin}${BASE_PATH}`,
    get: (path) => fetch(new URL(path, origin)),
    close: async () => {
      await server.close();
      outDir.remove();
    },
  };
}

function appVersionMeta(html: string): string | undefined {
  return /<meta name="app-version" content="([^"]*)"/.exec(html)?.[1];
}

function assetPaths(html: string): string[] {
  return [...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)].map(
    (match) => match[1],
  );
}

describe("the page CI publishes for a commit on main", () => {
  let site: ServedBuild;
  let builtAfter: number;
  let builtBefore: number;

  beforeAll(async () => {
    // ISO timestamps are written with millisecond precision; allow for the clock tick.
    builtAfter = Date.now() - 1000;
    site = await buildAndServe(machineEnv({ GITHUB_SHA }));
    builtBefore = Date.now() + 1000;
  }, 60_000);

  afterAll(async () => {
    await site.close();
  });

  // @regression — functional §2.1 c1, §2.2 c1 (version code = the short code GitHub shows)
  it("serves the page at the Pages base path with the commit's short code and build time", async () => {
    const response = await site.get(BASE_PATH);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain("<title>GREEN-API WhatsApp Chat</title>");
    expect(html).toContain('<div id="root"></div>');

    const [code, builtAt, ...rest] = (appVersionMeta(html) ?? "").split(" ");
    expect(code).toBe(SHORT_SHA);
    expect(rest).toEqual([]);
    expect(builtAt).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
    const time = Date.parse(builtAt);
    expect(time).toBeGreaterThanOrEqual(builtAfter);
    expect(time).toBeLessThanOrEqual(builtBefore);
  });

  // @regression — functional §2.1 c2: every asset resolves under the project path, so the page is never blank
  it("loads every script and stylesheet from under the Pages base path", async () => {
    const html = await (await site.get(BASE_PATH)).text();
    const assets = assetPaths(html);

    expect(assets.length).toBeGreaterThanOrEqual(2);
    for (const asset of assets) {
      expect(asset.startsWith(`${BASE_PATH}assets/`)).toBe(true);
      expect((await site.get(asset)).status).toBe(200);
    }
  });

  // @regression — functional §2.1 c1: the rendered label carries the same version as the meta tag
  it("bakes the same short code and build time into the page script", async () => {
    const html = await (await site.get(BASE_PATH)).text();
    const builtAt = (appVersionMeta(html) ?? "").split(" ")[1] ?? "";
    const scripts = assetPaths(html).filter((path) => path.endsWith(".js"));
    const code = (
      await Promise.all(
        scripts.map(async (path) => (await site.get(path)).text()),
      )
    ).join("\n");

    // Booleans, not toContain: a failure would otherwise print the whole minified bundle.
    // The minifier may quote string literals with ", ' or `.
    const hasLiteral = (text: string) =>
      ['"', "'", "`"].some((quote) => code.includes(`${quote}${text}${quote}`));
    expect(code.includes("GREEN-API WhatsApp Chat"), "app name").toBe(true);
    expect(code.includes("early skeleton"), "skeleton note").toBe(true);
    expect(hasLiteral(SHORT_SHA), `short code ${SHORT_SHA}`).toBe(true);
    expect(hasLiteral(builtAt), `build time ${builtAt}`).toBe(true);
  });

  it("never exposes the full commit SHA, only the short code", async () => {
    const html = await (await site.get(BASE_PATH)).text();

    expect(html).not.toContain(GITHUB_SHA);
  });
});

describe("the same page built on a reviewer's machine (no GITHUB_SHA)", () => {
  let site: ServedBuild;

  beforeAll(async () => {
    site = await buildAndServe(machineEnv());
  }, 60_000);

  afterAll(async () => {
    await site.close();
  });

  // @regression — functional §2.5 c2
  it("labels the build local instead of inventing a version code", async () => {
    const html = await (await site.get(BASE_PATH)).text();

    expect(appVersionMeta(html)).toBe("local");
    expect(html).not.toContain(SHORT_SHA);
  });
});

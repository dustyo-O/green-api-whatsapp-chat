// @vitest-environment node
// @layer: e2e
// @spec: 001-project-skeleton-first-deploy
//
// Functional §2.5 and §2.7 as far as one machine can check them: the README's instructions, the
// pinned runtime, and `npm run dev` serving the page at the address it prints. A fresh clone on
// exactly Node.js 22.22.2 and the EBADENGINE warning on another major are lead checks (tech §4).
import { spawn, type ChildProcess } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  BASE_PATH,
  PAGES_URL,
  ROOT,
  machineEnv,
  readProjectFile,
} from "./support";

const README = readProjectFile("README.md");

function readmeSection(heading: string): string {
  const start = README.indexOf(`\n## ${heading}\n`);
  if (start === -1) throw new Error(`README has no "## ${heading}" section`);
  const end = README.indexOf("\n## ", start + 1);
  return README.slice(start, end === -1 ? undefined : end);
}

function runLocallyCommands(): string[] {
  const block = /```sh\n([\s\S]*?)```/.exec(readmeSection("Run locally"));
  return (block?.[1] ?? "").split("\n").filter((line) => line.trim() !== "");
}

describe("the project front page (README)", () => {
  // @regression — functional §2.7 c1
  it("opens with a one-line description of the project", () => {
    const [title, blank, description, after] = README.split("\n");

    expect(title).toBe("# GREEN-API WhatsApp Chat");
    expect(blank).toBe("");
    expect(description).toMatch(/^[A-Z].{20,}\.$/);
    expect(after).toBe("");
  });

  // @regression — functional §2.7 c1, §2.1: the link points at the public page
  it("links to the public page, which lives under the path the build is made for", () => {
    expect(README).toContain(`**Live:** ${PAGES_URL}`);
    expect(new URL(PAGES_URL).pathname).toBe(BASE_PATH);
  });

  // @regression — functional §2.5 c1, §2.7 c1
  it("runs locally in at most three commands, starting by downloading the project", () => {
    const commands = runLocallyCommands();

    expect(commands.length).toBeGreaterThan(0);
    expect(commands.length).toBeLessThanOrEqual(3);
    expect(commands).toEqual([
      "git clone https://github.com/dustyo-O/green-api-whatsapp-chat.git && cd green-api-whatsapp-chat",
      "npm ci",
      "npm run dev",
    ]);
  });

  // @regression — functional §2.5 c1/c3
  it("names the required runtime the same way the install warning does", () => {
    const engines = (
      JSON.parse(readProjectFile("package.json")) as {
        engines: { node: string };
      }
    ).engines;

    expect(readmeSection("Run locally")).toContain(
      "Requires Node.js 22.22.2 or a newer 22.x.",
    );
    // npm prints this range verbatim in its EBADENGINE warning on any other version.
    expect(engines.node).toBe("^22.22.2");
    expect(readProjectFile(".nvmrc").trim()).toBe("22");
  });
});

describe("npm run dev (functional §2.5 c1/c2)", () => {
  let server: ChildProcess;
  let printedUrl: string;

  beforeAll(async () => {
    // Detached, so the whole npm → vite process group can be stopped afterwards.
    server = spawn("npm", ["run", "dev"], {
      cwd: ROOT,
      env: machineEnv(),
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    printedUrl = await new Promise<string>((resolve, reject) => {
      let output = "";
      const timer = setTimeout(() => {
        reject(new Error(`npm run dev printed no local address:\n${output}`));
      }, 30_000);
      const onData = (chunk: Buffer) => {
        output += chunk.toString();
        const match = /Local:\s+(http:\/\/\S+)/.exec(output);
        if (match?.[1]) {
          clearTimeout(timer);
          resolve(match[1]);
        }
      };
      server.stdout?.on("data", onData);
      server.stderr?.on("data", onData);
      server.on("exit", (code) => {
        clearTimeout(timer);
        reject(new Error(`npm run dev exited (${String(code)}):\n${output}`));
      });
    });
  }, 40_000);

  afterAll(() => {
    if (server.pid !== undefined) process.kill(-server.pid, "SIGTERM");
  });

  // @regression
  it("prints a local address under the project path", () => {
    expect(new URL(printedUrl).hostname).toBe("localhost");
    expect(new URL(printedUrl).pathname).toBe(BASE_PATH);
  });

  // @regression
  it("serves the page at that address, labelled local", async () => {
    const response = await fetch(printedUrl);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain("<title>GREEN-API WhatsApp Chat</title>");
    expect(html).toContain('<div id="root"></div>');
    expect(html).toContain('<meta name="app-version" content="local"');
  });
});

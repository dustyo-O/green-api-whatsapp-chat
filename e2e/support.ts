import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = fileURLToPath(new URL("..", import.meta.url));

export const PAGES_URL = "https://dustyo-o.github.io/green-api-whatsapp-chat/";
export const BASE_PATH = "/green-api-whatsapp-chat/";

export function readProjectFile(path: string): string {
  return readFileSync(join(ROOT, path), "utf8");
}

/**
 * The environment of a reviewer's machine: no CI variables, no git state leaking in from a hook
 * that happens to run these tests, husky switched on, no colours in the output.
 */
export function machineEnv(
  extra: Record<string, string> = {},
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith("GIT_") || key.startsWith("GITHUB_")) continue;
    if (key === "HUSKY" || key === "CI" || key === "NODE_ENV") continue;
    env[key] = value;
  }
  return { ...env, NO_COLOR: "1", FORCE_COLOR: "0", ...extra };
}

export interface RunResult {
  status: number | null;
  /** stdout and stderr interleaved as one string. */
  output: string;
}

export function run(
  command: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv; input?: string } = {},
): RunResult {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? ROOT,
    env: options.env ?? machineEnv(),
    input: options.input,
    encoding: "utf8",
  });
  if (result.error) throw result.error;
  return { status: result.status, output: result.stdout + result.stderr };
}

export function makeTempDir(prefix: string): {
  path: string;
  remove: () => void;
} {
  const path = mkdtempSync(join(tmpdir(), `green-api-${prefix}-`));
  return {
    path,
    remove: () => {
      rmSync(path, { recursive: true, force: true });
    },
  };
}

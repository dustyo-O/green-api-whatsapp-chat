// @vitest-environment node
// @layer: e2e
// @spec: 001-project-skeleton-first-deploy
//
// Functional §2.6, in a throwaway git repository made from this project's own files:
// the author's machine (after the project's tools are installed) and the CI commitlint command.
import { copyFileSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ROOT, machineEnv, makeTempDir, run, type RunResult } from "./support";

const GOOD = "feat(app): show build version on placeholder page";
const BAD = "updated stuff";

let repo: ReturnType<typeof makeTempDir>;

function git(args: string[], extraConfig: string[] = []): RunResult {
  return run(
    "git",
    [
      "-c",
      "user.name=Acceptance Test",
      "-c",
      "user.email=acceptance@example.invalid",
      "-c",
      "commit.gpgsign=false",
      ...extraConfig,
      ...args,
    ],
    { cwd: repo.path },
  );
}

function gitOk(args: string[], extraConfig: string[] = []): string {
  const result = git(args, extraConfig);
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed:\n${result.output}`);
  }
  return result.output.trim();
}

/** A commit made with no hooks at all, to build history that the hook would refuse. */
function commitUnchecked(message: string): string {
  gitOk(
    ["commit", "--allow-empty", "-m", message],
    ["-c", `core.hooksPath=${join(repo.path, "no-hooks")}`],
  );
  return gitOk(["rev-parse", "HEAD"]);
}

/** What the author's `git commit` does once the project's tools are installed. */
function commit(message: string): RunResult {
  return git(["commit", "--allow-empty", "-m", message]);
}

/** The exact command of CI's `commitlint` job, with the PR's SHAs passed through env. */
function lintRange(base: string, head: string): RunResult {
  return run(
    "npm",
    ["run", "commitlint", "--", "--from", base, "--to", head, "--verbose"],
    { cwd: repo.path },
  );
}

beforeAll(() => {
  repo = makeTempDir("commits");
  for (const file of ["package.json", "commitlint.config.js"]) {
    copyFileSync(join(ROOT, file), join(repo.path, file));
  }
  mkdirSync(join(repo.path, ".husky"));
  copyFileSync(
    join(ROOT, ".husky/commit-msg"),
    join(repo.path, ".husky/commit-msg"),
  );
  mkdirSync(join(repo.path, "no-hooks"));
  writeFileSync(join(repo.path, ".gitignore"), "node_modules\nno-hooks\n");
  symlinkSync(join(ROOT, "node_modules"), join(repo.path, "node_modules"));

  gitOk(["init", "--quiet", "--initial-branch=main"]);
  gitOk(["add", "."]);
  commitUnchecked("chore: start the project");

  // `npm ci` runs `prepare`; that script is what installs the hook on the author's machine.
  const install = run("npm", ["run", "prepare"], { cwd: repo.path });
  if (install.status !== 0) {
    throw new Error(`npm run prepare failed:\n${install.output}`);
  }
}, 60_000);

afterAll(() => {
  repo.remove();
});

describe("saving a change on the author's machine", () => {
  // @regression — functional §2.6 c1
  it("saves a change described in the shared format", () => {
    const before = gitOk(["rev-parse", "HEAD"]);

    const result = commit(GOOD);

    expect(result.status, result.output).toBe(0);
    expect(gitOk(["log", "-1", "--format=%s"])).toBe(GOOD);
    expect(gitOk(["rev-parse", "HEAD"])).not.toBe(before);
  });

  it("saves a change with a body and the lane footer", () => {
    const result = commit(
      `${GOOD}\n\nAdds the version label.\n\nRefs: TKT-1 s4/testing-expert`,
    );

    expect(result.status, result.output).toBe(0);
  });

  it("saves git's standard merge message", () => {
    const result = commit("Merge branch 'lane/001-s4-testing-expert'");

    expect(result.status, result.output).toBe(0);
  });

  // @regression — functional §2.6 c2
  it("refuses a change described as 'updated stuff' and explains the expected format", () => {
    const before = gitOk(["rev-parse", "HEAD"]);

    const result = commit(BAD);

    expect(result.status).not.toBe(0);
    expect(result.output).toContain("subject may not be empty");
    expect(result.output).toContain("type may not be empty");
    expect(gitOk(["rev-parse", "HEAD"])).toBe(before);
  });

  it.each([
    ["an unknown kind of change", "feature(app): show build version"],
    ["a capitalised kind", "Feat(app): show build version"],
    ["a summary ending with a period", "feat(app): show build version."],
    ["a header over 100 characters", `feat(app): ${"x".repeat(90)}`],
  ])("refuses %s", (_, message) => {
    const before = gitOk(["rev-parse", "HEAD"]);

    const result = commit(message);

    expect(result.status, result.output).not.toBe(0);
    expect(gitOk(["rev-parse", "HEAD"])).toBe(before);
  });
});

describe("the automatic check of a proposed change", () => {
  let base: string;
  let good: string;
  let bad: string;

  beforeAll(() => {
    gitOk(["switch", "--quiet", "-c", "proposed-change"]);
    base = gitOk(["rev-parse", "HEAD"]);
    good = commitUnchecked(GOOD);
    bad = commitUnchecked(BAD);
  });

  // @regression — functional §2.6 c3
  it("fails and names the saved change whose description breaks the format", () => {
    const result = lintRange(base, bad);

    expect(result.status).not.toBe(0);
    expect(result.output).toContain(`--- input ---\n${BAD}\n✖`);
    expect(result.output).toContain("type may not be empty");
  });

  it("passes when every saved change in the proposal follows the format", () => {
    const result = lintRange(base, good);

    expect(result.status, result.output).toBe(0);
    expect(result.output).toContain(`--- input ---\n${GOOD}\n✔`);
  });
});

describe("the CI runner", () => {
  // Spec 001 tech §2.6: CI sets HUSKY=0 so `npm ci` never installs hooks on runners.
  it("does not install the hook when HUSKY=0", () => {
    const runner = makeTempDir("runner");
    try {
      const env = machineEnv({ HUSKY: "0" });
      run("git", ["init", "--quiet"], { cwd: runner.path, env });
      copyFileSync(
        join(ROOT, "package.json"),
        join(runner.path, "package.json"),
      );
      symlinkSync(
        join(ROOT, "node_modules"),
        join(runner.path, "node_modules"),
      );

      expect(
        run("npm", ["run", "prepare"], { cwd: runner.path, env }).status,
      ).toBe(0);
      expect(
        run("git", ["config", "--local", "core.hooksPath"], {
          cwd: runner.path,
          env,
        }).output,
      ).toBe("");
    } finally {
      runner.remove();
    }
  });
});

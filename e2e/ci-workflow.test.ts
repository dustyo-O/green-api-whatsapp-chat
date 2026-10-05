// @vitest-environment node
// @layer: e2e
// @spec: 001-project-skeleton-first-deploy
//
// Functional §2.2–§2.4 happen on GitHub; the lead observes them on the live site. What can be
// checked here: the deploy job's tip guard, run for real with a fake `git`, and the workflow
// structure the delivery guarantees rest on (tech §2.7 names the ones that regress silently).
import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { machineEnv, makeTempDir, readProjectFile, run } from "./support";

const WORKFLOW = readProjectFile(".github/workflows/ci.yml");
const LINES = WORKFLOW.split("\n");
const ON_MAIN_PUSH =
  "github.event_name == 'push' && github.ref == 'refs/heads/main'";

const indentOf = (line: string) => line.length - line.trimStart().length;

/** The lines of `key:` at exactly `indent` spaces, plus everything nested under it. */
function section(lines: string[], key: string, indent: number): string[] {
  const head = `${" ".repeat(indent)}${key}:`;
  const start = lines.findIndex(
    (line) => line === head || line.startsWith(`${head} `),
  );
  if (start === -1) throw new Error(`no "${key}:" at indent ${String(indent)}`);
  const end = lines.findIndex(
    (line, i) => i > start && line.trim() !== "" && indentOf(line) <= indent,
  );
  const block = lines.slice(start, end === -1 ? undefined : end);
  while (block.at(-1)?.trim() === "") block.pop();
  return block;
}

const job = (name: string) => section(section(LINES, "jobs", 0), name, 2);
const text = (lines: string[]) => lines.join("\n");

/** Steps of a job, each as its own block of lines. */
function steps(jobLines: string[]): string[][] {
  const body = section(jobLines, "steps", 4).slice(1);
  const result: string[][] = [];
  for (const line of body) {
    if (line.trim().startsWith("#")) continue;
    if (line.startsWith("      - ")) result.push([line]);
    else result.at(-1)?.push(line);
  }
  return result;
}

/** The `run: |` script of the deploy job's tip guard, dedented, as Actions writes it to disk. */
function tipGuardScript(): string {
  const step = steps(job("deploy")).find((lines) =>
    lines.some((line) => /^(- )?name: Tip guard$/.test(line.trim())),
  );
  if (!step) throw new Error("deploy has no Tip guard step");
  const runAt = step.findIndex((line) => line.trim() === "run: |");
  const script = step.slice(runAt + 1);
  const indent = Math.min(
    ...script.filter((l) => l.trim() !== "").map(indentOf),
  );
  return script.map((line) => line.slice(indent)).join("\n");
}

describe("the deploy job's tip guard (functional §2.2 c4)", () => {
  const SHA = "1111111111111111111111111111111111111111";
  const NEWER = "2222222222222222222222222222222222222222";
  const REPO_URL = "https://github.com/dustyo-O/green-api-whatsapp-chat.git";
  let dir: ReturnType<typeof makeTempDir>;

  beforeAll(() => {
    dir = makeTempDir("tip-guard");
    writeFileSync(join(dir.path, "guard.sh"), tipGuardScript());
    // Stands in for `git ls-remote`: records its arguments, prints the tip it is given.
    const fakeGit = join(dir.path, "git");
    writeFileSync(
      fakeGit,
      [
        "#!/bin/sh",
        'printf "%s\\n" "$*" > "$FAKE_GIT_ARGS"',
        'if [ -n "$FAKE_GIT_FAIL" ]; then echo "fatal: unable to access" >&2; exit 128; fi',
        'if [ -n "$FAKE_TIP" ]; then printf "%s\\trefs/heads/main\\n" "$FAKE_TIP"; fi',
      ].join("\n"),
    );
    chmodSync(fakeGit, 0o755);
  });

  afterAll(() => {
    dir.remove();
  });

  function guard(remote: { tip?: string; fail?: boolean }) {
    const outputFile = join(dir.path, "github-output");
    writeFileSync(outputFile, "");
    // GitHub's default `run` shell on Linux runners.
    const result = run(
      "bash",
      ["--noprofile", "--norc", "-eo", "pipefail", join(dir.path, "guard.sh")],
      {
        cwd: dir.path,
        env: machineEnv({
          PATH: `${dir.path}:${process.env.PATH ?? ""}`,
          GITHUB_SHA: SHA,
          GITHUB_OUTPUT: outputFile,
          REPO_URL,
          FAKE_GIT_ARGS: join(dir.path, "git-args"),
          FAKE_TIP: remote.tip ?? "",
          FAKE_GIT_FAIL: remote.fail ? "1" : "",
        }),
      },
    );
    return {
      ...result,
      githubOutput: readFileSync(outputFile, "utf8"),
      gitArgs: readFileSync(join(dir.path, "git-args"), "utf8").trim(),
    };
  }

  // @regression
  it("publishes the commit that is the tip of main", () => {
    const result = guard({ tip: SHA });

    expect(result.status, result.output).toBe(0);
    expect(result.githubOutput).toBe("publish=true\n");
    expect(result.gitArgs).toBe(`ls-remote ${REPO_URL} refs/heads/main`);
  });

  // @regression
  it("skips publishing, stays green and says why when a newer commit is the tip (re-run of an older run)", () => {
    const result = guard({ tip: NEWER });

    expect(result.status, result.output).toBe(0);
    expect(result.githubOutput).toBe("publish=false\n");
    expect(result.output).toContain(
      `::notice::${SHA} superseded by ${NEWER}; not publishing`,
    );
  });

  // @regression
  it("fails without publishing when the tip of main can't be read", () => {
    const result = guard({});

    expect(result.status).not.toBe(0);
    expect(result.githubOutput).toBe("");
    expect(result.output).toContain("::error::Could not read the tip of main");
  });

  it("fails without publishing when git can't reach GitHub", () => {
    const result = guard({ fail: true });

    expect(result.status).not.toBe(0);
    expect(result.githubOutput).toBe("");
  });
});

describe("the CI workflow", () => {
  // @regression — functional §2.3 c1
  it("runs on every proposed change and on every push to main", () => {
    const on = text(section(LINES, "on", 0));

    expect(on).toMatch(/^ {2}pull_request:/m);
    expect(on).toMatch(/^ {2}push:\n {4}branches: \[main\]$/m);
  });

  // @regression — functional §2.3: style, code consistency, tests and a full build
  it("checks every change with the same gate the lanes run", () => {
    const check = job("check");
    const scripts = (
      JSON.parse(readProjectFile("package.json")) as {
        scripts: Record<string, string>;
      }
    ).scripts;

    expect(check.some((line) => line.trim().startsWith("if:"))).toBe(false);
    expect(text(check)).toContain("- run: npm ci");
    expect(text(check)).toContain("- run: npm run check");
    expect(scripts.check).toBe(
      "npm run format:check && npm run lint && npm run typecheck && npm run test && npm run build",
    );
  });

  // @regression — functional §2.2 c3 (review F4): must stay workflow-level, never cancel a running main run
  it("serialises main runs at workflow level so an older run can't publish after a newer one", () => {
    expect(text(section(LINES, "concurrency", 0))).toBe(
      [
        "concurrency:",
        "  group: ci-${{ github.ref }}",
        "  cancel-in-progress: ${{ github.event_name == 'pull_request' }}",
      ].join("\n"),
    );
    expect(text(section(LINES, "jobs", 0))).not.toMatch(/^\s+concurrency:/m);
  });

  // @regression — functional §2.2 c2: a proposed change never reaches the public page
  it("deploys only pushes to main", () => {
    const deploy = text(job("deploy"));

    expect(deploy).toContain(`    if: ${ON_MAIN_PUSH}\n`);
  });

  // @regression — functional §2.2, §2.4 c1: a change that fails its checks is never published
  it("deploys only after the check passed, publishing exactly the bytes that passed it", () => {
    const deploy = job("deploy");
    const upload = steps(job("check")).find((step) =>
      text(step).includes("actions/upload-pages-artifact@"),
    );

    expect(text(deploy)).toContain("    needs: check\n");
    expect(upload && text(upload)).toContain(`if: ${ON_MAIN_PUSH}`);
    expect(upload && text(upload)).toContain("path: dist");
    expect(text(deploy)).not.toMatch(/npm|vite|actions\/checkout/);
  });

  // @regression — functional §2.2 c4 (review 2 F1)
  it("puts the tip guard first and publishes only when it says so", () => {
    const deploySteps = steps(job("deploy"));
    const publish = deploySteps.find((step) =>
      text(step).includes("actions/deploy-pages@"),
    );

    expect(text(deploySteps.at(0) ?? [])).toContain("name: Tip guard");
    expect(text(deploySteps.at(0) ?? [])).toContain("id: tip");
    expect(publish && text(publish)).toContain(
      "if: steps.tip.outputs.publish == 'true'",
    );
  });

  // @regression — functional §2.6 c3
  it("lints every saved change of a proposed change and names each one", () => {
    const commitlint = text(job("commitlint"));

    expect(commitlint).toContain("if: github.event_name == 'pull_request'");
    expect(commitlint).toContain("fetch-depth: 0");
    expect(commitlint).toContain(
      'run: npm run commitlint -- --from "$BASE_SHA" --to "$HEAD_SHA" --verbose',
    );
    expect(commitlint).toContain(
      "BASE_SHA: ${{ github.event.pull_request.base.sha }}",
    );
    expect(commitlint).toContain(
      "HEAD_SHA: ${{ github.event.pull_request.head.sha }}",
    );
  });

  it("never installs git hooks on runners", () => {
    expect(text(section(LINES, "env", 0))).toContain("HUSKY: 0");
  });
});

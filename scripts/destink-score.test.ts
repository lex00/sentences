// Spawns the real CLI as a subprocess — the thing issue #13's acceptance criterion actually asks
// for: `node scripts/destink-score.mjs file.md` prints the JSON report, same input, same score,
// every run. Everything else about the report shape is covered by src/lint/report.test.ts; this
// test only needs to prove the node-runnable entry point itself works end to end.

import { describe, it, expect, afterAll } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { stripTypesSupport } from "./destink-score.mjs";

const CLI = fileURLToPath(new URL("./destink-score.mjs", import.meta.url));

const dir = mkdtempSync(join(tmpdir(), "destink-score-cli-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const fixture = join(dir, "fixture.md");
writeFileSync(
  fixture,
  "This is a very good idea. It is really quite clever. The dog chased the ball across the yard.\n",
);

function runCli(...args: string[]) {
  return spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8" });
}

describe("stripTypesSupport", () => {
  it("recognizes the flag-required, built-in, and unsupported Node ranges", () => {
    expect(stripTypesSupport("v22.6.0")).toBe("flag");
    expect(stripTypesSupport("v22.14.2")).toBe("flag");
    expect(stripTypesSupport("v23.0.0")).toBe("none");
    expect(stripTypesSupport("v24.13.1")).toBe("none");
    expect(stripTypesSupport("v22.5.9")).toBe("unsupported");
    expect(stripTypesSupport("v18.20.4")).toBe("unsupported");
  });
});

describe("the destink-score CLI (subprocess)", () => {
  it("prints a valid JSON report for a real file and exits 0", () => {
    const result = runCli(fixture);
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    const report = JSON.parse(result.stdout);
    expect(report.version).toBe(1);
    expect(report.counts.findings).toBeGreaterThan(0);
    expect(typeof report.score.total).toBe("number");
  });

  // Two full CLI spawns; the rule set has grown enough that 5s (vitest's default) is tight.
  it("produces the exact same JSON on repeated runs — same input, same score, every run", { timeout: 30_000 }, () => {
    const first = runCli(fixture);
    const second = runCli(fixture);
    expect(second.stdout).toBe(first.stdout);
  });

  it("exits non-zero with a usage message when no file is given", () => {
    const result = runCli();
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("usage:");
  });
});

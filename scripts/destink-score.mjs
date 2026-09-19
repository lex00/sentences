#!/usr/bin/env node
// Scorer CLI (issue #13): run a file through the rule-based lint path and print its stink report as
// JSON, without a browser and without a build step.
//
//   node scripts/destink-score.mjs [--markdown] <file>
//
// --markdown runs the input through extractProse (src/lint/markdown-prose.ts) first, which blanks
// code fences, tables, inline code, link targets, HTML blocks and admonition directives to spaces.
// Offsets are preserved, so every span in the report still indexes the file on disk. Use it for a
// .md file: over a technical-docs corpus it removed ~64% of findings, all of them markdown being
// read as prose (see that module's header for the measurement).
//
// Same input, same score, every run — see src/lint/report.ts and src/lint/score.ts for what makes
// that true.
//
// Node-runnable, no bundler: this project's .ts sources import each other with ".js" specifiers
// (see scripts/ts-loader.mjs), so importing them from plain Node needs two things Node provides
// natively — no new dependency:
//   1. Type stripping to run .ts files at all (--experimental-strip-types on Node >=22.6, on by
//      default on Node >=23 — see stripTypesSupport below for the exact cutoffs this wrapper uses).
//   2. A resolve hook (scripts/ts-loader.mjs) so a ".js" specifier that doesn't exist on disk
//      falls back to its ".ts" sibling.
// If the running Node can't do (1) at all, this refuses to add a transpiler dependency and exits
// with an explanation instead (see the "unsupported" branch below).

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { register } from "node:module";
import { fileURLToPath } from "node:url";

const STRIP_TYPES_FLAG = "--experimental-strip-types";

export const USAGE = `usage: node scripts/destink-score.mjs [--markdown] <file>

Lints <file> for AI-writing tropes and prints the versioned JSON report on stdout: located
findings, per-rule and per-tier counts, and a stink score (weighted findings per 1000 words).
Reads the file and nothing else; nothing is written back and nothing leaves the machine.

  --markdown   Blank code fences, tables, inline code, link targets, HTML blocks and admonitions
               to spaces before linting, so markdown structure is not read as prose. Spans still
               index the original file. Use it on .md files: without it, markdown reads as prose
               and floods the report (~64% of findings on a measured technical-docs corpus).
  --strictness=N
               How hard to look, 1 to 3. 2 is the default and the level every threshold in the
               rule set was calibrated against. 3 drops density floors to zero, so one instance of
               a shape reports the same as six, and raises each finding a severity step: use it on
               text you already know a model wrote. 1 doubles the floors and eases severities, for
               prose with a voice you are trying not to flatten.
  --reduce=N   Report what could be CUT rather than what reads as a tell. N is 1 to 3 and is its
               own dial, separate from --strictness: 1 offers only material the diagram draws
               detached or parenthesised, 2 (default) adds modifiers of modifiers, 3 adds any
               adjunct hanging off the baseline. Every candidate is checked by cutting it and
               re-parsing: if the subject, verb or complement moves, it is withdrawn. Prints a
               reduction report instead of the lint report. Nothing is edited.
  --reduce-to=N
               With --reduce, stop once the document would reach N words. Takes the deepest cuts
               first and says so when it cannot get there without touching the baseline.
  --help, -h   Print this and exit.

Runs from a checkout of this repo only. For editor and agent use, the same linter ships as an MCP
server on the published package:
  npx -y --package=sentences destink-mcp`;

// "flag"        Node >=22.6, <23: type stripping exists but needs the flag.
// "none"        Node >=23: type stripping is on by default.
// "unsupported" Anything older: no built-in TypeScript support at all.
export function stripTypesSupport(version) {
  const m = /^v(\d+)\.(\d+)/.exec(version);
  if (!m) return "unsupported";
  const major = Number(m[1]);
  const minor = Number(m[2]);
  if (major >= 23) return "none";
  if (major === 22 && minor >= 6) return "flag";
  return "unsupported";
}

async function main() {
  const support = stripTypesSupport(process.version);
  if (support === "unsupported") {
    console.error(
      `destink-score: needs Node >=22.6 (with ${STRIP_TYPES_FLAG}) or >=23 (built in) for ` +
        `native TypeScript support. Found ${process.version}. Refusing to add a transpiler ` +
        `dependency to work around an old Node — see issue #13.`,
    );
    process.exit(1);
  }

  if (support === "flag" && !process.execArgv.includes(STRIP_TYPES_FLAG)) {
    // Re-exec with the flag Node needs. Only reached on Node 22.6–22.x; the machine this was
    // written and tested on (>=23) never takes this branch, but a repo tool should not just fail
    // on the previous LTS when one re-exec fixes it.
    const result = spawnSync(
      process.execPath,
      [STRIP_TYPES_FLAG, fileURLToPath(import.meta.url), ...process.argv.slice(2)],
      { stdio: "inherit" },
    );
    process.exit(result.status ?? 1);
  }

  const args = process.argv.slice(2);
  // An explicit --help is a request that succeeded, so it prints to stdout and exits 0. A missing
  // file is a mistake, so the same text goes to stderr with a non-zero exit. Before, --help fell
  // through the second path by accident: right text, wrong stream, wrong exit code.
  if (args.includes("--help") || args.includes("-h")) {
    console.log(USAGE);
    process.exit(0);
  }

  const markdown = args.includes("--markdown");

  // Parsed here rather than in run.ts so a bad value fails before a file is read: "--strictness=9"
  // silently linting at 2 would be a worse answer than an error naming the three levels.
  const strictnessArg = args.find((a) => a.startsWith("--strictness"));
  let strictness = 2;
  if (strictnessArg) {
    const raw = strictnessArg.split("=")[1];
    strictness = Number(raw);
    if (![1, 2, 3].includes(strictness)) {
      console.error(`--strictness must be 1, 2 or 3 (got ${raw === undefined ? "no value" : JSON.stringify(raw)})`);
      process.exit(1);
    }
  }

  const reduceArg = args.find((a) => a.startsWith("--reduce="));
  const reduceToArg = args.find((a) => a.startsWith("--reduce-to="));
  let reduceLevel = null;
  if (reduceArg) {
    reduceLevel = Number(reduceArg.split("=")[1]);
    if (![1, 2, 3].includes(reduceLevel)) {
      console.error(`--reduce must be 1, 2 or 3 (got ${JSON.stringify(reduceArg.split("=")[1] ?? "")})`);
      process.exit(1);
    }
  }
  let targetWords;
  if (reduceToArg) {
    targetWords = Number(reduceToArg.split("=")[1]);
    if (!Number.isInteger(targetWords) || targetWords < 0) {
      console.error(`--reduce-to must be a whole number of words (got ${JSON.stringify(reduceToArg.split("=")[1] ?? "")})`);
      process.exit(1);
    }
    if (reduceLevel === null) {
      console.error("--reduce-to needs --reduce=N to say how deep to cut");
      process.exit(1);
    }
  }

  const filePath = args.find((a) => !a.startsWith("--"));
  if (!filePath) {
    console.error(USAGE);
    process.exit(1);
  }

  // Registered before the dynamic imports below so it governs their resolution too.
  register(new URL("./ts-loader.mjs", import.meta.url));

  // One call, because the order of the steps inside it matters: --markdown changes what the
  // RULES see, never what the report is built from, so every span still indexes the file on disk.
  // src/lint/run.ts owns that ordering for this script, the MCP server (src/mcp/) and the package's
  // `sentences/lint/run` export alike.
  const { lintDocument, reduceText } = await import("../src/lint/run.js");

  const text = readFileSync(filePath, "utf8");
  const report =
    reduceLevel === null
      ? lintDocument(text, { markdown, strictness })
      : reduceText(text, { markdown, level: reduceLevel, targetWords });

  console.log(JSON.stringify(report, null, 2));
}

// Only run when invoked directly (`node destink-score.mjs ...`), not when re-exec'd via the
// dynamic import a test might use to reach stripTypesSupport in isolation.
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

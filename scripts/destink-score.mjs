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
  const markdown = args.includes("--markdown");
  const filePath = args.find((a) => !a.startsWith("--"));
  if (!filePath) {
    console.error("usage: node scripts/destink-score.mjs [--markdown] <file>");
    process.exit(1);
  }

  // Registered before the dynamic imports below so it governs their resolution too.
  register(new URL("./ts-loader.mjs", import.meta.url));

  const { buildDocAnalysis } = await import("../src/lint/build-doc.js");
  const { RULES, enabledRules } = await import("../src/lint/registry.js");
  const { runRules } = await import("../src/lint/engine.js");
  const { buildReport } = await import("../src/lint/report.js");

  const text = readFileSync(filePath, "utf8");
  // extractProse returns a string of the same length, so findings located against it index `text`.
  // The report is therefore still built from the ORIGINAL text: word count and every span mean
  // what they meant before, and only what the RULES see changes.
  const { extractProse } = await import("../src/lint/markdown-prose.js");
  const doc = buildDocAnalysis(markdown ? extractProse(text) : text);
  const rules = enabledRules({}, RULES);
  const { findings, errors } = runRules(rules, doc);
  const report = buildReport(text, findings, errors, rules);

  console.log(JSON.stringify(report, null, 2));
}

// Only run when invoked directly (`node destink-score.mjs ...`), not when re-exec'd via the
// dynamic import a test might use to reach stripTypesSupport in isolation.
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

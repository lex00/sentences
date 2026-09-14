// What the de-stink MCP tools actually do, with no MCP in sight. server.ts owns stdio, the SDK and
// the protocol envelope; this file owns meaning, so every decision below is a plain function a test
// calls directly rather than something only reachable by speaking JSON-RPC at a subprocess.
//
// The report is the contract, not these renderings. `format: "json"` returns exactly what
// `node scripts/destink-score.mjs` prints for the same input — both call `lintDocument`
// (src/lint/run.ts), and report.ts pins the key order that makes two runs byte-identical. The
// "summary" and "score" formats are views of that same object, computed here and nowhere else; a
// number that appears in a summary and not in the report would be this file inventing something.
//
// Why renderings at all, when the caller is a model that can read JSON: offsets. A finding's span
// is a half-open character range, which is the right thing for an editor and useless to something
// that has to find the words again in a document it is holding as text. The summary turns each span
// into line:col plus the offending excerpt, which is what an agent needs to act on a finding; and
// "score" exists because the common follow-up call is "did my edit help?", which needs one number,
// not two hundred findings re-sent.

import { readFileSync } from "node:fs";
import type { Report, ReportFinding } from "../lint/report.js";
import type { TropeTier } from "../lint/types.js";
import { lintDocument } from "../lint/run.js";
import type { Strictness } from "../lint/strictness.js";
import { DEFAULT_STRICTNESS, STRICTNESS_LEVELS, isStrictness } from "../lint/strictness.js";
import { RULES } from "../lint/registry.js";
import { TIERS } from "../lint/score.js";

// ---------------------------------------------------------------------------------------------
// destink_lint arguments
// ---------------------------------------------------------------------------------------------

export const LINT_FORMATS = ["summary", "score", "json"] as const;
export type LintFormat = (typeof LINT_FORMATS)[number];

export type LintArgs = {
  source: { kind: "text"; text: string } | { kind: "path"; path: string };
  markdown: boolean;
  format: LintFormat;
  strictness: Strictness;
};

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

const LINT_KEYS = ["text", "path", "markdown", "format", "strictness"];
const MARKDOWN_EXT = /\.(md|markdown|mdx)$/i;

// A path that looks like markdown gets markdown handling unless the caller says otherwise. Text
// passed inline gets none: a model pasting a paragraph is pasting prose, and guessing "markdown"
// from a stray backtick would silently blank part of the very text it was asked to lint.
export const markdownDefault = (args: { path?: unknown }): boolean =>
  typeof args.path === "string" && MARKDOWN_EXT.test(args.path);

// Hand-rolled rather than zod, so the SDK's schema library stays the SDK's business and the
// validation this server's behavior depends on is a function with its own tests. Unknown keys are
// rejected on purpose: `{"file": "README.md"}` silently linting nothing is a worse failure than an
// error naming the keys that do exist.
export function parseLintArgs(raw: unknown): Parsed<LintArgs> {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "arguments must be an object" };
  }
  const args = raw as Record<string, unknown>;

  const unknown = Object.keys(args).filter((k) => !LINT_KEYS.includes(k));
  if (unknown.length > 0) {
    return { ok: false, error: `unknown argument(s): ${unknown.join(", ")}. Accepted: ${LINT_KEYS.join(", ")}` };
  }

  const hasText = args.text !== undefined;
  const hasPath = args.path !== undefined;
  if (hasText === hasPath) {
    return {
      ok: false,
      error: hasText
        ? "pass either `text` or `path`, not both"
        : "pass `text` (the prose itself) or `path` (a file to read)",
    };
  }
  if (hasText && typeof args.text !== "string") return { ok: false, error: "`text` must be a string" };
  if (hasPath && typeof args.path !== "string") return { ok: false, error: "`path` must be a string" };
  if (hasPath && (args.path as string).trim() === "") return { ok: false, error: "`path` must not be empty" };

  if (args.markdown !== undefined && typeof args.markdown !== "boolean") {
    return { ok: false, error: "`markdown` must be a boolean" };
  }
  if (args.format !== undefined && !LINT_FORMATS.includes(args.format as LintFormat)) {
    return { ok: false, error: `\`format\` must be one of: ${LINT_FORMATS.join(", ")}` };
  }
  if (args.strictness !== undefined && !isStrictness(args.strictness)) {
    return { ok: false, error: `\`strictness\` must be one of: ${STRICTNESS_LEVELS.join(", ")}` };
  }

  return {
    ok: true,
    value: {
      source: hasText
        ? { kind: "text", text: args.text as string }
        : { kind: "path", path: args.path as string },
      markdown: (args.markdown as boolean | undefined) ?? markdownDefault(args),
      format: (args.format as LintFormat | undefined) ?? "summary",
      strictness: (args.strictness as Strictness | undefined) ?? DEFAULT_STRICTNESS,
    },
  };
}

// ---------------------------------------------------------------------------------------------
// destink_lint
// ---------------------------------------------------------------------------------------------

export type ReadFile = (path: string) => string;
const defaultReadFile: ReadFile = (path) => readFileSync(path, "utf8");

// Resolve whatever the caller sent to the text to lint. The failure that matters is a bad path: the
// message keeps the path and the OS reason, because "ENOENT" alone leaves the caller guessing
// whether it typed the name wrong or the server is running in a different directory.
export function readSource(args: LintArgs, readFile: ReadFile = defaultReadFile): Parsed<string> {
  if (args.source.kind === "text") return { ok: true, value: args.source.text };
  try {
    return { ok: true, value: readFile(args.source.path) };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `could not read ${args.source.path}: ${reason}` };
  }
}

export type LintOutcome = { ok: true; text: string; report: Report; rendered: string } | { ok: false; error: string };

export function runLint(raw: unknown, readFile: ReadFile = defaultReadFile): LintOutcome {
  const parsed = parseLintArgs(raw);
  if (!parsed.ok) return parsed;

  const source = readSource(parsed.value, readFile);
  if (!source.ok) return source;

  const text = source.value;
  const report = lintDocument(text, { markdown: parsed.value.markdown, strictness: parsed.value.strictness });
  return { ok: true, text, report, rendered: render(text, report, parsed.value.format) };
}

export function render(text: string, report: Report, format: LintFormat): string {
  if (format === "json") return JSON.stringify(report, null, 2);
  if (format === "score") return formatScore(report);
  return formatSummary(text, report);
}

// ---------------------------------------------------------------------------------------------
// Renderings
// ---------------------------------------------------------------------------------------------

// Score is a rate, so it carries as many decimals as the division gives it. One is enough to read:
// the number's whole job is comparison between two drafts, and 16.6 vs 12.1 answers that as well as
// 16.597510373443983 does. The JSON format keeps the full value.
const rate = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(1));

const countList = (counts: Readonly<Record<string, number>>, keys: readonly string[] = Object.keys(counts)): string =>
  keys
    .filter((k) => (counts[k] ?? 0) > 0)
    .map((k) => `${k} ${counts[k]}`)
    .join(", ");

function headline(report: Report): string {
  const n = report.counts.findings;
  const found = n === 0 ? "no findings" : n === 1 ? "1 finding" : `${n} findings`;
  return `destink: ${found} in ${report.wordCount} words; score ${rate(report.score.total)} (weighted findings per 1000 words)`;
}

export function formatScore(report: Report): string {
  const lines = [headline(report)];
  const tiers = countList(report.counts.byTier, TIERS as readonly string[]);
  if (tiers) lines.push(`tiers: ${tiers}`);
  const rules = countList(report.counts.byRule);
  if (rules) lines.push(`rules: ${rules}`);
  lines.push(...errorLines(report));
  return lines.join("\n");
}

export function formatSummary(text: string, report: Report): string {
  const lines = [headline(report)];
  const tiers = countList(report.counts.byTier, TIERS as readonly string[]);
  if (tiers) lines.push(`tiers: ${tiers}`);

  if (report.findings.length > 0) {
    const starts = lineStarts(text);
    const locs = report.findings.map((f) => formatLoc(lineCol(starts, f.span.start)));
    const locWidth = Math.max(...locs.map((l) => l.length));
    const sevWidth = Math.max(...report.findings.map((f) => f.severity.length));
    const indent = " ".repeat(locWidth + sevWidth + 4);

    // An explanation is the same sentence every time a rule fires on the same shape, and rules fire
    // in runs. Print it on a rule's first finding and let the rest stand on their message — which
    // carries the per-finding detail (which word, how many in a row) anyway. Repeating a paragraph
    // twenty times costs the reader more than it tells them.
    const seen = new Set<string>();
    let omitted = 0;

    lines.push("");
    for (const [i, f] of report.findings.entries()) {
      lines.push(`${locs[i]!.padEnd(locWidth)}  ${f.severity.padEnd(sevWidth)}  ${f.ruleId}: ${f.message}`);
      lines.push(`${indent}> ${excerpt(text, f)}`);
      const key = `${f.ruleId} ${f.explanation}`;
      if (seen.has(key)) omitted++;
      else {
        seen.add(key);
        lines.push(`${indent}${f.explanation}`);
      }
      if (i < report.findings.length - 1) lines.push("");
    }

    if (omitted > 0) {
      const s = omitted === 1 ? "" : "s";
      lines.push("");
      lines.push(`(${omitted} further finding${s} repeated an explanation already shown for its rule; each is printed once)`);
    }
  }

  lines.push(...errorLines(report));
  return lines.join("\n");
}

const errorLines = (report: Report): string[] =>
  report.errors.length === 0
    ? []
    : ["", "rule errors (these rules did not finish; their findings are missing from the counts above):",
       ...report.errors.map((e) => `  ${e.ruleId}: ${e.message}`)];

const MAX_EXCERPT = 120;

// The source slice for a finding, on one line. Whitespace is collapsed because a span can cross
// sentence and paragraph boundaries (the discourse rules measure density over a whole document), and
// a finding that dumps six lines of the input back at the caller buries the next finding.
export function excerpt(text: string, finding: ReportFinding): string {
  const raw = text.slice(finding.span.start, finding.span.end).replace(/\s+/g, " ").trim();
  return raw.length > MAX_EXCERPT ? `${raw.slice(0, MAX_EXCERPT - 3)}...` : raw;
}

// ---------------------------------------------------------------------------------------------
// Offsets -> line:col
// ---------------------------------------------------------------------------------------------

// Offsets of the first character of each line, so N findings cost one pass over the text instead of
// N. Line 1 starts at 0 even in an empty string: every offset lands somewhere.
export function lineStarts(text: string): number[] {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === "\n") starts.push(i + 1);
  return starts;
}

// 1-based line and column, the convention every editor and compiler already uses. Column counts
// UTF-16 code units, same as the spans themselves, so col N and span offset N move together; an
// emoji therefore advances the column by 2, which is the honest answer for a caller that is going
// to slice the string rather than look at a screen.
export function lineCol(starts: readonly number[], offset: number): { line: number; col: number } {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid]! <= offset) lo = mid;
    else hi = mid - 1;
  }
  return { line: lo + 1, col: offset - starts[lo]! + 1 };
}

export const formatLoc = (at: { line: number; col: number }): string => `${at.line}:${at.col}`;

// ---------------------------------------------------------------------------------------------
// destink_rules
// ---------------------------------------------------------------------------------------------

export type RuleSummary = { id: string; name: string; tier: TropeTier };

const RULES_KEYS = ["tier"];

export function parseRulesArgs(raw: unknown): Parsed<{ tier?: TropeTier }> {
  if (raw === undefined || raw === null) return { ok: true, value: {} };
  if (typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: "arguments must be an object" };
  const args = raw as Record<string, unknown>;

  const unknown = Object.keys(args).filter((k) => !RULES_KEYS.includes(k));
  if (unknown.length > 0) {
    return { ok: false, error: `unknown argument(s): ${unknown.join(", ")}. Accepted: ${RULES_KEYS.join(", ")}` };
  }
  if (args.tier === undefined) return { ok: true, value: {} };
  if (!TIERS.includes(args.tier as TropeTier)) {
    return { ok: false, error: `\`tier\` must be one of: ${TIERS.join(", ")}` };
  }
  return { ok: true, value: { tier: args.tier as TropeTier } };
}

// The rule set as data, in registry order (which is the order findings are attributed when two rules
// tie — see registry.ts), so a caller can tell what it is being judged on before it is judged.
export function listRules(tier?: TropeTier): RuleSummary[] {
  return RULES.filter((r) => tier === undefined || r.tier === tier).map((r) => ({
    id: r.id,
    name: r.name,
    tier: r.tier,
  }));
}

export function runRulesList(raw: unknown): { ok: true; rendered: string } | { ok: false; error: string } {
  const parsed = parseRulesArgs(raw);
  if (!parsed.ok) return parsed;
  return { ok: true, rendered: formatRules(listRules(parsed.value.tier)) };
}

export function formatRules(rules: readonly RuleSummary[]): string {
  if (rules.length === 0) return "no rules match that tier";
  const width = Math.max(...rules.map((r) => r.id.length));
  const header = `${rules.length} rule(s), in the order findings are attributed when two rules tie:`;
  return [header, "", ...rules.map((r) => `${r.id.padEnd(width)}  ${r.tier.padEnd(10)}  ${r.name}`)].join("\n");
}

// The whole lint pipeline as one call: text in, `Report` out.
//
// Everything this file does was already possible — build the analysis, pick the rule set, run it,
// build the report — but it took four imports and a five-line dance that every caller had to get
// right in the same order. `scripts/destink-score.mjs` had that dance inline; so did the MCP server
// (`src/mcp/`); so would anyone consuming the package. Four copies of a sequence is four places for
// it to drift, and the one that drifts silently is `markdown`: run `extractProse` and you must
// still build the report from the ORIGINAL text, or every word count and every span in the output
// means something slightly different from what the caller has on disk. That ordering is the reason
// this function exists.
//
// The invariant, stated once so callers don't have to rediscover it: `extractProse` returns a
// string of the SAME LENGTH as its input (it blanks markdown to spaces rather than removing it), so
// a finding located against the extracted prose indexes the original text unchanged. The rules see
// prose; the report is built from what the caller actually has.

import type { TropeRule } from "./types.js";
import type { Report } from "./report.js";
import type { RuleToggles } from "./registry.js";
import { RULES, enabledRules } from "./registry.js";
import { runRules } from "./engine.js";
import type { Strictness } from "./strictness.js";
import { DEFAULT_STRICTNESS } from "./strictness.js";
import { buildReport } from "./report.js";
import { buildDocAnalysis } from "./build-doc.js";
import { extractProse } from "./markdown-prose.js";
import type { DocumentReduction, ReductionLevel } from "./reduction.js";
import { DEFAULT_REDUCTION_LEVEL, budget, coveredWords, reduceDocument } from "./reduction.js";
import { countWords } from "./score.js";

export type LintOptions = {
  // Blank markdown structure (code fences, tables, inline code, link targets, HTML blocks,
  // admonitions) to spaces before the rules see it. Use it for a .md file: without it markdown
  // reads as prose and floods the report — ~64% of findings over a measured technical-docs corpus
  // were markdown being linted as sentences (see markdown-prose.ts's header for the measurement).
  markdown?: boolean;
  // Per-rule on/off, same shape the app's toggles (#25) persist. A rule set to `false` doesn't run
  // and contributes nothing to the score; anything absent is on.
  toggles?: RuleToggles;
  // The rule set to filter `toggles` against. Defaults to the full registry; a test or an
  // experiment passes a subset rather than toggling off everything else by hand.
  rules?: readonly TropeRule[];
  // How hard to look: 1 lenient, 2 standard (the default and the calibrated behavior), 3 strict —
  // density floors to zero, so one instance of a shape reports the same as six. See strictness.ts.
  strictness?: Strictness;
};

// Lint `text` and return the versioned JSON report (see report.ts for the schema and why its key
// order is stable). Deterministic: same input, same options, byte-identical output, no network and
// no filesystem access.
export function lintDocument(text: string, options: LintOptions = {}): Report {
  const rules = enabledRules(options.toggles ?? {}, options.rules ?? RULES);
  const doc = buildDocAnalysis(options.markdown ? extractProse(text) : text);
  const { findings, errors } = runRules(rules, doc, options.strictness ?? DEFAULT_STRICTNESS);
  return buildReport(text, findings, errors, rules);
}

// --- reduction (#51) ---------------------------------------------------------------------------

// Reduction answers a different question from the lint report, so it gets a different report. The
// lint report is `version: 1` with a pinned key order and consumers that rely on it; bolting a
// candidate list onto it would change that shape for everybody, including the callers who never
// ask for one. A separate document costs nothing and keeps the promise.

export type ReduceOptions = {
  markdown?: boolean;
  // How deep to cut: 1 unconnected and parenthetical only, 2 (default) adds modifiers of
  // modifiers, 3 adds any adjunct off the baseline. Deliberately NOT `strictness` — see
  // reduction.ts, they answer different questions.
  level?: ReductionLevel;
  // Stop once the document would reach this many words. Omit to report every candidate.
  targetWords?: number;
};

export type ReductionReport = {
  version: 1;
  level: ReductionLevel;
  wordCount: number;
  candidates: DocumentReduction["candidates"];
  words: number; // words the candidates would remove, counting overlaps once
  wouldBe: number; // wordCount minus that
  reachedTarget: boolean | null; // null when no target was asked for
  unlocatable: number;
  refused: number;
};

// What could come off `text`, checked and ranked. Deterministic, offline, and it edits nothing.
export function reduceText(text: string, options: ReduceOptions = {}): ReductionReport {
  const doc = buildDocAnalysis(options.markdown ? extractProse(text) : text);
  const level = options.level ?? DEFAULT_REDUCTION_LEVEL;
  const reduction = reduceDocument(doc.text, doc.units, level);
  const wordCount = countWords(text);

  const picked =
    options.targetWords === undefined ? null : budget(reduction, wordCount, options.targetWords);
  const candidates = picked ? picked.taken : reduction.candidates;
  // Merged, not summed: nested candidates would otherwise be counted twice. See coveredWords.
  const words = coveredWords(doc.text, candidates);

  return {
    version: 1,
    level,
    wordCount,
    candidates,
    words,
    wouldBe: wordCount - words,
    reachedTarget: picked ? picked.reached : null,
    unlocatable: reduction.unlocatable,
    refused: reduction.refused,
  };
}

// The monotone re-lint loop.
//
// The idea in one line: never trust a fix, measure it. Apply it, run the whole linter again, and
// keep the result only if the document got strictly better and nothing new appeared. Otherwise put
// the text back exactly as it was. Correctness is not something the fixer has to argue for; it is
// something the loop checks, every time, against the same linter the reader will see.
//
// ACCEPTANCE. A step is accepted iff all three hold:
//   1. the total finding count strictly DECREASED;
//   2. no finding in the new result is NEW — every key in the new result is the remapped key of a
//      finding that was already there (apply.ts's remap rules 1-5 do the shifting; a finding whose
//      words were cut into cannot be followed and so anything reported there counts as new);
//   3. no rule started throwing that was not throwing before.
// Anything else: revert to the byte-for-byte snapshot taken before the step.
//
// TERMINATION. Define the measure M = (F, C) ordered lexicographically on N x N, where
//   F = the number of findings in the current text, and
//   C = the number of candidate fixes for the current text that have not been permanently rejected.
// Every iteration of the while loop below either returns or strictly decreases M:
//   - An iteration that accepts a step decreases F, by acceptance condition 1. (C may jump around
//     freely; lexicographic order does not care what the second component does when the first one
//     falls.)
//   - An iteration that accepts nothing leaves the text untouched — every rejected attempt is
//     reverted — so F is unchanged, and it reaches the one-at-a-time retry, where every fix it
//     tries and does not accept is added to `dead` and never proposed again. The batch is non-empty
//     whenever we get there, so at least one fix is killed, and since the text did not change, the
//     candidate set is recomputed identically minus the dead ones: C strictly decreases.
//   - An iteration that finds no candidates at all breaks out.
// N x N under the lexicographic order is well-founded, so there is no infinite descending chain and
// the loop halts. maxIterations is a seatbelt, not the argument — if it is ever hit, something in
// this file is wrong, and `iterations` in the result is how a test notices.
//
// One consequence worth stating plainly, because it is the whole point of the epic: the final text
// is the author's own words with some of them removed, and its findings are a subset of the
// findings the author started with. Not "probably better". A subset.

import type { DocAnalysis, Finding, Span, TropeRule } from "../types.js";
import type { LintResult } from "../engine.js";
import { runRules } from "../engine.js";
import { makeDoc } from "../stub-doc.js";
import type { Fix, FixProvider } from "./types.js";
import { findingKey, idOf, keyOf } from "./types.js";
import type { Splice } from "./apply.js";
import { applySplices, remapId, splicesFor, validateFix } from "./apply.js";

export type RejectedFix = { fix: Fix; reason: string };

// One accepted step, kept so a caller can follow a finding all the way from the original text to
// the final one: fold remapId over `steps[i].splices` in order. The loop proves the subset property
// step by step; this is what lets a test (and #24) prove it end to end.
export type FixStep = { fixes: Fix[]; splices: Splice[]; findingsBefore: number; findingsAfter: number };

export type FixLoopResult = {
  text: string; // the fixed document
  applied: Fix[]; // in the order they were accepted
  rejected: RejectedFix[]; // every fix that was tried and put back, with why
  before: LintResult; // the linter's verdict on the input
  after: LintResult; // the linter's verdict on `text`
  steps: FixStep[]; // accepted steps, in order, with the splices that made them
  iterations: number; // how many rounds it took; compare against maxIterations to check convergence
};

export type FixLoopOptions = {
  // How to turn text into a DocAnalysis. Defaults to the stub splitter so the loop is testable with
  // no parser and no model; the app passes the real analyzer once #9 lands.
  analyze?: (text: string) => DocAnalysis;
  maxIterations?: number;
};

export const DEFAULT_MAX_ITERATIONS = 1000;

// A fix's identity for the purpose of "we tried that, it did not work". Includes the edits, not
// just the finding, so a fixer that offers a different fix for the same finding later still gets a
// hearing. Offsets move when the text changes, so this key is only meaningful within one text
// state — which is exactly the scope the termination argument needs it for.
const fixSignature = (fix: Fix): string => `${keyOf(fix.findingId)}|${JSON.stringify(fix.edits)}`;

// The stretch of document a fix is responsible for: its finding plus everywhere its edits reach
// (a move's destination included, since splicesFor lowers it to a zero-width splice there).
function regionOf(fix: Fix, splices: readonly Splice[]): Span {
  let start = fix.findingId.span.start;
  let end = fix.findingId.span.end;
  for (const sp of splices) {
    if (sp.start < start) start = sp.start;
    if (sp.end > end) end = sp.end;
  }
  return { start, end };
}

// Half-open: two fixes whose regions merely touch (one deletes a word, the next cleans up the space
// immediately after it) are independent and go in the same batch.
const conflicts = (a: Span, b: Span): boolean => a.start < b.end && b.start < a.end;

// Why a step was refused, or null if it was fine. Kept as one function so the three conditions are
// read in one place and appear verbatim in the rejection reasons.
function refuse(prev: LintResult, next: LintResult, splices: readonly Splice[]): string | null {
  if (next.findings.length >= prev.findings.length) {
    return `finding count did not fall (${prev.findings.length} -> ${next.findings.length})`;
  }
  if (next.errors.length > prev.errors.length) return "a rule started throwing";

  // runRules dedupes on exactly ruleId+span, so the keys within one LintResult are already
  // distinct: comparing these as sets IS comparing them as multisets.
  const carried = new Set<string>();
  for (const f of prev.findings) {
    const id = remapId(idOf(f), splices);
    if (id) carried.add(keyOf(id));
  }
  for (const f of next.findings) {
    if (!carried.has(findingKey(f))) {
      return `introduced a new finding: ${f.ruleId} at [${f.span.start}, ${f.span.end})`;
    }
  }
  return null;
}

type Candidate = { fix: Fix; splices: Splice[]; region: Span };
type Attempt = { text: string; doc: DocAnalysis; result: LintResult; splices: Splice[] };

export function fixLoop(
  rules: readonly TropeRule[],
  text: string,
  fixes: FixProvider,
  options: FixLoopOptions = {},
): FixLoopResult {
  const analyze = options.analyze ?? ((t: string) => makeDoc(t));
  const maxIterations = options.maxIterations ?? DEFAULT_MAX_ITERATIONS;

  let doc = analyze(text);
  let result = runRules(rules, doc);
  const before = result;
  let current = text;

  const applied: Fix[] = [];
  const rejected: RejectedFix[] = [];
  const steps: FixStep[] = [];
  const dead = new Set<string>(); // fixes that failed on their own; never proposed again
  let iterations = 0;

  // Apply a set of candidates to the current text and lint the outcome. Nothing here mutates the
  // loop's state: the caller commits, or throws the attempt away and `current` is untouched.
  const attempt = (batch: readonly Candidate[]): Attempt | string => {
    const splices = batch.flatMap((c) => c.splices);
    let nextText: string;
    try {
      nextText = applySplices(current, splices);
    } catch (err) {
      return err instanceof Error ? err.message : String(err);
    }
    const nextDoc = analyze(nextText);
    const nextResult = runRules(rules, nextDoc);
    const no = refuse(result, nextResult, splices);
    return no ?? { text: nextText, doc: nextDoc, result: nextResult, splices };
  };

  const commit = (a: Attempt, batch: readonly Candidate[]): void => {
    steps.push({
      fixes: batch.map((c) => c.fix),
      splices: a.splices,
      findingsBefore: result.findings.length,
      findingsAfter: a.result.findings.length,
    });
    for (const c of batch) applied.push(c.fix);
    current = a.text;
    doc = a.doc;
    result = a.result;
  };

  const kill = (fix: Fix, reason: string): void => {
    rejected.push({ fix, reason });
    dead.add(fixSignature(fix));
  };

  while (iterations < maxIterations) {
    iterations++;

    // --- collect: one fix per finding, from whichever fixer owns the rule ---
    const candidates: Candidate[] = [];
    for (const finding of result.findings) {
      let fix: Fix | null;
      try {
        fix = fixes(finding, doc);
      } catch (err) {
        // A fixer that throws is a bug in the fixer, not a reason to stop fixing the document.
        rejected.push({
          fix: { findingId: idOf(finding), edits: [] },
          reason: `fixer threw: ${err instanceof Error ? err.message : String(err)}`,
        });
        continue;
      }
      if (!fix) continue;
      if (dead.has(fixSignature(fix))) continue;
      // The containment check is only worth anything if the span it checks against is the span the
      // rule actually pointed at. A fixer that widened its own findingId would be marking its own
      // homework.
      if (keyOf(fix.findingId) !== findingKey(finding)) {
        kill(fix, `fix claims finding ${keyOf(fix.findingId)} but was given ${findingKey(finding)}`);
        continue;
      }
      const bad = validateFix(current, fix);
      if (bad) {
        kill(fix, bad);
        continue;
      }
      const splices = splicesFor(current, fix.edits);
      candidates.push({ fix, splices, region: regionOf(fix, splices) });
    }
    if (candidates.length === 0) break;

    // --- partition: a non-overlapping batch goes in one pass, the rest wait for the next round ---
    const batch: Candidate[] = [];
    for (const c of candidates) {
      if (batch.some((b) => conflicts(b.region, c.region))) continue; // deferred: re-lint first
      batch.push(c);
    }

    // --- apply, re-lint, accept or revert ---
    const whole = attempt(batch);
    if (typeof whole !== "string") {
      commit(whole, batch);
      continue;
    }

    // The batch as a whole did not earn its keep. Retry one fix at a time: the first that works on
    // its own is taken, and everything tried before it is dead for good.
    let progressed = false;
    for (const c of batch) {
      const single = batch.length === 1 ? whole : attempt([c]);
      if (typeof single !== "string") {
        commit(single, [c]);
        progressed = true;
        break;
      }
      kill(c.fix, single);
    }
    if (!progressed && batch.length === candidates.length) break; // nothing left that is not dead
  }

  return { text: current, applied, rejected, before, after: result, steps, iterations };
}

// Follow one finding from the original document into the fixed one. Returns null the moment the
// finding's span is cut into by a step — which, given acceptance condition 2, means that finding is
// gone rather than merely moved. This is the composition of apply.ts's per-step remap over every
// accepted step, and it is how the "final findings are a subset of the initial ones" property is
// checked end to end.
export function remapThrough(finding: Finding, steps: readonly FixStep[]): string | null {
  let id = idOf(finding);
  for (const step of steps) {
    const next = remapId(id, step.splices);
    if (!next) return null;
    id = next;
  }
  return keyOf(id);
}

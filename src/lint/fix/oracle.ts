// The oracle referee: judging an edit this repository did not write.
//
// fix/types.ts states the mechanical fixer's bargain in its header — every edit is a deletion, a
// move, or a punctuation repair, so the output is a subsequence of the author's own words and the
// only open question is whether the finding count fell. That bargain is what makes loop.ts's
// acceptance test honest, and it is exactly what an outside editor cannot offer. A model asked to
// rewrite a flagged span hands back NEW prose, and new prose can carry new tells.
//
// This file is the other half of that argument rather than a retreat from it. The linter never
// calls a model and never reaches the network; it referees. Something upstream — an agent holding
// the document, reached through src/mcp/ or a CLI — proposes replacement text for ONE finding's
// span, and everything below decides whether that text is allowed to stand, by re-linting and
// comparing, never by asking the model whether it did a good job.
//
// WHY A SEPARATE PATH. loop.ts cannot referee this. Its second acceptance condition asks that every
// finding in the new result be the remapped image of one that was already there, and apply.ts's
// remapSpan (rule 4) refuses to follow any span a word-changing splice touched. Arbitrary
// replacement text is word-changing by definition, so every finding near the edit becomes
// unfollowable, reads as new, and the step is refused. The rule is right for splices of the
// author's words and useless here; what replaces it is a scope test rather than a following test.
//
// ACCEPTANCE. The edit replaces exactly the span the finding names, so the flagged words are gone
// by construction and there is nothing to ask about whether the edit "did its job" — what is left
// to check is whether it did any damage. An edit replacing [s, e) with `replacement` is accepted
// iff all four hold:
//   1. no rule started throwing that was not throwing before;
//   2. NOTHING is reported inside the new text. Every finding whose span falls within
//      [s, s + replacement.length) is a tell the model just introduced, and one is enough to
//      refuse. This is the condition that does the work loop.ts got from the repair invariant: the
//      replacement has to be clean, not merely cleaner;
//   3. the REST OF THE DOCUMENT is untouched. Every finding outside the replacement matches a
//      pre-edit finding under pure offset shifting — same rule id, same words, moved only by how
//      much the edit lengthened or shortened the text ahead of it;
//   4. the total finding count strictly DECREASED.
// Anything else and the caller gets its text back unchanged, with the reason.
//
// Conditions 2 and 3 are checked before 4 because they say something the caller can act on ("your
// replacement carries an em dash") where a bare count comparison does not. They also already force
// it: the target finding's span maps onto the replacement region exactly, condition 2 keeps
// anything there out of the result, and condition 3 admits only images of findings that were
// already present — so the result is a subset of the old findings minus the target, one smaller at
// least. The explicit count check stays as the guard that would catch a future change to either.
//
// WHAT SURVIVES OF THE GUARANTEE, stated plainly because it is weaker than the fixer's and the
// difference matters. The mechanical loop promises the final text is the author's words with some
// removed, and its findings a subset of the findings it started with — a subset, not "probably
// better". An accepted oracle edit promises less: strictly fewer findings, nothing new anywhere in
// the document, and every part of the document the model was not editing provably unchanged. What
// it cannot promise is that the new words are the author's, because they are not. That judgment
// stays with the person reading the result, which is why nothing here writes a file.

import type { DocAnalysis, Span, TropeRule } from "../types.js";
import type { LintResult } from "../engine.js";
import { runRules } from "../engine.js";
import { makeDoc } from "../stub-doc.js";
import type { FindingId } from "./types.js";
import { findingKey, idOf, keyOf } from "./types.js";

// One proposal: replace the span of `findingId` with `replacement`. The span is the finding's own,
// not a free choice — an editor that wants to rewrite a different stretch of text is proposing a
// different finding's edit, and saying so explicitly is what keeps condition 5 meaningful.
// An empty `replacement` is a deletion and is allowed; it is the one edit the mechanical fixer
// could also have made.
export type OracleEdit = { findingId: FindingId; replacement: string };

export type OracleVerdict =
  | { accepted: true; text: string; before: LintResult; after: LintResult; reason: null }
  | { accepted: false; text: string; before: LintResult; after: LintResult | null; reason: string };

export type OracleOptions = {
  // How to turn text into a DocAnalysis. Defaults to the stub splitter, same as loop.ts, so the
  // referee is testable with no parser and no model behind it.
  analyze?: (text: string) => DocAnalysis;
};

// --- offset arithmetic --------------------------------------------------------------------------

// Where offset `o` lands after [s, e) becomes text of length `len`. Null when `o` is strictly
// inside the replaced span: the character it named is gone, and there is no honest image for it.
// Deliberately NOT apply.ts's remapOffset, which additionally vetoes any offset inside a
// word-changing splice — that veto is what makes the mechanical loop's following test strict, and
// here it would veto the document-spanning findings (repetition/dilution reports [0, len)) that
// condition 5 has to be able to carry across every edit.
function shift(o: number, s: number, e: number, delta: number): number | null {
  if (o <= s) return o;
  if (o >= e) return o + delta;
  return null;
}

const shiftSpan = (span: Span, s: number, e: number, delta: number): Span | null => {
  const start = shift(span.start, s, e, delta);
  const end = shift(span.end, s, e, delta);
  return start === null || end === null ? null : { start, end };
};

const contains = (outer: Span, inner: Span): boolean => inner.start >= outer.start && inner.end <= outer.end;

// --- the referee ----------------------------------------------------------------------------

// Judge one proposed edit against `text`. Pure: nothing is written, nothing is cached, and the same
// arguments always produce the same verdict.
export function refereeEdit(
  rules: readonly TropeRule[],
  text: string,
  edit: OracleEdit,
  options: OracleOptions = {},
): OracleVerdict {
  const analyze = options.analyze ?? ((t: string) => makeDoc(t));
  const before = runRules(rules, analyze(text));
  const no = (reason: string, after: LintResult | null = null): OracleVerdict => ({
    accepted: false,
    text,
    before,
    after,
    reason,
  });

  const { start: s, end: e } = edit.findingId.span;
  if (!Number.isInteger(s) || !Number.isInteger(e) || s < 0 || e < s || e > text.length) {
    return no(`edit span [${s}, ${e}) does not fit a ${text.length}-char document`);
  }
  // The finding has to be one the linter actually reported. Refereeing an edit against a span
  // nothing was flagged at would make conditions 1 and 5 vacuous.
  const targetKey = keyOf(edit.findingId);
  if (!before.findings.some((f) => findingKey(f) === targetKey)) {
    return no(`no finding ${edit.findingId.ruleId} at [${s}, ${e}) in the current text`);
  }
  if (text.slice(s, e) === edit.replacement) return no("replacement is identical to the text it replaces");

  const nextText = text.slice(0, s) + edit.replacement + text.slice(e);
  const delta = edit.replacement.length - (e - s);
  const region: Span = { start: s, end: s + edit.replacement.length };
  const after = runRules(rules, analyze(nextText));

  // 1 — a rule that started throwing means the new text broke something the old one did not.
  if (after.errors.length > before.errors.length) return no("a rule started throwing", after);

  // 2 and 3, in one pass over the new findings. runRules dedupes on ruleId+span, so the keys in a
  // LintResult are already distinct and comparing them as a set IS comparing them as a multiset.
  const carried = new Set<string>();
  for (const f of before.findings) {
    const span = shiftSpan(f.span, s, e, delta);
    if (span) carried.add(keyOf({ ruleId: f.ruleId, span }));
  }
  for (const f of after.findings) {
    if (contains(region, f.span)) {
      return no(`the replacement text carries its own tell: ${f.ruleId} — ${f.message}`, after); // 2
    }
    if (!carried.has(findingKey(f))) {
      return no(`disturbed the rest of the document: ${f.ruleId} at [${f.span.start}, ${f.span.end})`, after); // 3
    }
  }

  // 4 — forced by 2 and 3 above; kept so a change to either cannot quietly weaken the guarantee.
  if (after.findings.length >= before.findings.length) {
    return no(`finding count did not fall (${before.findings.length} -> ${after.findings.length})`, after);
  }

  return { accepted: true, text: nextText, before, after, reason: null };
}

// --- a run of edits ---------------------------------------------------------------------------

export type OracleStep = { edit: OracleEdit; accepted: boolean; reason: string | null };

export type OracleRunResult = {
  text: string; // the document after every accepted edit
  steps: OracleStep[]; // every edit in the order it was judged, with its verdict
  before: LintResult; // the linter's verdict on the input
  after: LintResult; // the linter's verdict on `text`
};

// Referee a sequence of proposals one at a time, keeping the accepted ones. Each edit is judged
// against the text as it stands after the previous accepted one, so a caller must re-lint between
// rounds to get live spans — which is the same discipline loop.ts imposes on its fixers, and the
// reason `OracleEdit` carries a finding id rather than a bare offset pair.
//
// Monotone by construction: every accepted step strictly decreases the finding count and a refused
// one leaves the text byte-for-byte alone, so the run terminates and the final text is never worse
// than the input by the only measure this repository claims to have.
export function refereeEdits(
  rules: readonly TropeRule[],
  text: string,
  edits: readonly OracleEdit[],
  options: OracleOptions = {},
): OracleRunResult {
  const analyze = options.analyze ?? ((t: string) => makeDoc(t));
  const before = runRules(rules, analyze(text));
  const steps: OracleStep[] = [];
  let current = text;
  let after = before;

  for (const edit of edits) {
    const verdict = refereeEdit(rules, current, edit, options);
    steps.push({ edit, accepted: verdict.accepted, reason: verdict.reason });
    if (verdict.accepted) {
      current = verdict.text;
      after = verdict.after;
    }
  }

  return { text: current, steps, before, after };
}

export { idOf };

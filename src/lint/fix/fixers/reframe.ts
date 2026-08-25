// REFRAME COLLAPSE — the fix for rules/reframe.ts's `reframe` finding (#24).
//
// "It is not X. It is Y." says one thing twice: the denial is scaffolding for the assertion, and the
// assertion is the sentence the author meant to write. The fix keeps the assertion and drops the
// scaffolding.
//
//   before   The problem was not the code; it was your head.
//   after    The problem was your head.
//
// Two forms ship, and only the first is registered as an automatic fixer:
//
//   collapse   (default) pure deletion. Delete from the negator to the start of clause B's
//              complement. What survives is clause A's subject and copula followed by clause B's
//              complement — a strict subsequence of the input, with at most one capital repaired.
//   contrast   the ", not X" enrichment. Clause A's negated complement is MOVED to the end of
//              clause B and joined with a comma:
//
//                before   The problem was not the code; it was your head.
//                after    The problem was your head, not the code.
//
//              Offered through reframeProposals() for #25's UI to put in front of a human, not run
//              autonomously: it keeps the denial, so whether it is an improvement is a judgement
//              about this sentence, and the loop cannot make judgements — it can only count
//              findings, and both forms score the same.
//
// --- what the edit algebra could NOT express ---
//
// Issue #24's illustration is "It's backwards wearing bold clothes." — clause B's complement with
// clause A's complement spliced into the middle of it as a modifier. Unreachable, and not for a
// fiddly reason: it needs the word "wearing", which the input does not contain, and TextEdit has no
// insert (see types.ts). The reachable enrichment appends the denial rather than weaving it in.
//
// The contracted form ("It's not bold. It's backwards.") is also out of reach today, but for a
// different reason and not this file's: the rule-based tagger drops the contracted copula, so the
// rule never fires on it in the first place (engine bug #31, documented in rules/reframe.ts).
//
// --- scope: adjacent units only ---
//
// The rule reports three shapes under one id. This fixer handles one of them and returns null for
// the other two, because null is the honest answer when a fixer cannot locate the words:
//
//   cross-unit   "A. B." and the semicolon/colon form. HANDLED — the two clauses are two units, so
//                the source offsets of each half come from the unit spans.
//   in-unit      one unit lowered to two clauses (the dash variant). NOT handled: the Clause IR
//                carries no source offsets (a Word is `{ text, pos }` — see src/ir.ts), so with both
//                clauses inside one unit there is no way to say where clause A stops without
//                guessing which occurrence of the verb belongs to which clause.
//   because      "not because X, but because Y". NOT handled: the rule detects it from token shape
//                precisely because the second because-clause never reaches the IR, so there is
//                nothing structural to cut against.
//
// Both unhandled shapes have the same span signature — the finding starts and ends inside ONE unit —
// which is how they are told apart from the handled one below.

import type { Clause } from "../../../ir.js";
import type { DocAnalysis, Finding, Span, UnitAnalysis } from "../../types.js";
import { isCopular, isNegated } from "../../ir-query.js";
import type { Fix, TextEdit } from "../types.js";
import { coreEnd, isAlnum, isLower, startsUnit, wordsOf } from "./seam.js";

// The two halves of a cross-unit reframe, resolved to source offsets. Everything the two fix shapes
// below need, computed once, so they cannot disagree about where the sentence comes apart.
type Pair = {
  a: UnitAnalysis; // the denial
  b: UnitAnalysis; // the replacement
  complementStart: number; // where clause B's complement begins: the first word after B's copula
};

// Clause B's copula, located in the SOURCE. The IR knows the verb's text but not where it is, so
// this matches the head's last token (a verb chain like "has been" lowers to one head Word joined by
// spaces — see lower.ts's verbHead) against B's own word spans. Index 0 is skipped: that is the
// subject, and "It is it" should not resolve the verb to the subject.
function verbWordIndex(clause: Clause, unit: UnitAnalysis): number {
  if (!("head" in clause.verb)) return -1; // compound predicate: isCopular already refused it
  const token = clause.verb.head.text.trim().split(/\s+/).pop()?.toLowerCase();
  if (!token) return -1;
  return wordsOf(unit).findIndex((w, i) => i >= 1 && w.text.toLowerCase() === token);
}

function locate(finding: Finding, doc: DocAnalysis): Pair | null {
  const fs = finding.span;
  const ai = doc.units.findIndex((u) => u.span.start <= fs.start && fs.start < u.span.end);
  if (ai < 0) return null;
  const a = doc.units[ai]!;
  const b = doc.units[ai + 1];
  // The in-unit and because variants both end inside unit A; the cross-unit form ends at the end of
  // the NEXT unit, which is what the rule's own span construction says (rules/reframe.ts).
  if (!b || fs.end !== b.span.end || fs.end <= a.span.end) return null;

  // Re-confirm the shape against the live IR rather than trusting the finding's message. The loop
  // re-lints and re-fixes after every step, so by the time this runs the document may have moved.
  const ca = (a.clauses ?? []).at(-1);
  const cb = (b.clauses ?? [])[0];
  if (!ca || !cb) return null;
  if (!(isCopular(ca) && isNegated(ca) && isCopular(cb) && !isNegated(cb))) return null;

  const words = wordsOf(b);
  const vi = verbWordIndex(cb, b);
  const after = vi >= 0 ? words[vi + 1] : undefined;
  if (!after) return null;
  return { a, b, complementStart: after.span.start };
}

const findingIdOf = (finding: Finding): Fix["findingId"] => ({ ruleId: finding.ruleId, span: { ...finding.span } });

// --- collapse: delete the denial, keep the assertion ---------------------------------------------
//
// One delete, from the negator (where the rule pointed) through clause B's subject and copula, and
// one repair if the deletion leaves a lowercase letter starting a sentence. Nothing is moved and
// nothing is reordered: the output is the input with a contiguous run of words removed.
export function reframeCollapse(finding: Finding, doc: DocAnalysis): Fix | null {
  const found = locate(finding, doc);
  if (!found) return null;
  const text = doc.text;
  const fs = finding.span;
  const cut: Span = { start: fs.start, end: found.complementStart };
  if (cut.end <= cut.start || cut.end > fs.end) return null;

  const edits: TextEdit[] = [{ kind: "delete", span: cut }];
  // "Not the code is the point. It is the price." — deleting from a sentence-initial negator hands
  // the capital to whatever now starts the sentence, exactly as fixers/demo.ts does.
  const next = text[cut.end];
  if (startsUnit(text, cut.start) && isLower(next)) {
    edits.push({ kind: "repair", span: { start: cut.end, end: cut.end + 1 }, replacement: next!.toUpperCase() });
  }
  return { findingId: findingIdOf(finding), edits };
}

// --- contrast: keep the assertion, demote the denial to a trailing ", not X" ---------------------
//
// The move is what makes this expressible at all. "not the code" is not deleted, it is lifted out of
// clause A and put down at the end of clause B; the comma that joins it is added as a TRAILING affix
// on the last letter of B ("d" -> "d, "), which isValidRepair permits because the core of the string
// is unchanged. The move's destination has to be the last offset inside the finding span, and the
// repair has to sit just before it, so the splice walk emits "…head" then ", " then "not the code"
// and finally the sentence's own "." from outside the move.
export function reframeContrast(finding: Finding, doc: DocAnalysis): Fix | null {
  const found = locate(finding, doc);
  if (!found) return null;
  const text = doc.text;
  const fs = finding.span;
  const { a, b, complementStart } = found;

  const denial: Span = { start: fs.start, end: coreEnd(text, a.span.end) }; // "not the code"
  const landing = coreEnd(text, b.span.end); // just past clause B's last word
  if (denial.end <= denial.start) return null;
  if (landing <= complementStart || landing > fs.end) return null;
  if (landing >= denial.start && landing <= denial.end) return null; // a move may not land in itself

  // The letter the joining comma hangs off. Punctuation there (a closing quote, say) would make the
  // repair a core change and be refused, so bail rather than build an edit that cannot validate.
  const anchor = text[landing - 1];
  if (!isAlnum(anchor)) return null;

  const edits: TextEdit[] = [
    { kind: "move", span: denial, to: landing },
    { kind: "repair", span: { start: landing - 1, end: landing }, replacement: `${anchor}, ` },
  ];
  // The boundary A and B used to be separated by ("; " or ". ") is now mid-sentence: drop it.
  const gap: Span = { start: denial.end, end: b.span.start };
  if (gap.end > gap.start) edits.push({ kind: "repair", span: gap, replacement: "" });
  // Clause B's subject and copula are redundant with clause A's, which now leads the sentence.
  const redundant: Span = { start: b.span.start, end: complementStart };
  if (redundant.end > redundant.start) edits.push({ kind: "delete", span: redundant });

  return { findingId: findingIdOf(finding), edits };
}

// Every fix this file can offer for one finding, strongest-first, for #25 to put in front of a
// human. The loop only ever sees the first one (see registry.ts).
export const reframeProposals = (finding: Finding, doc: DocAnalysis): Fix[] =>
  [reframeCollapse(finding, doc), reframeContrast(finding, doc)].filter((f): f is Fix => f !== null);

// The registered fixer: the collapse, because it is the one that is right without a judgement call.
export const reframeFixer = reframeCollapse;

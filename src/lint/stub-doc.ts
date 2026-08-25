// A DocAnalysis you can build from a string, with no parser and no model. Rules and their fixtures
// need documents by the dozen; #9's real analyzeDocument needs 72 MB of weights and a few hundred
// milliseconds per unit. So: split naively on sentence punctuation, scan out the words, and fill in
// honest source offsets. Everything the parse would add (tree, clauses, POS tags) is simply absent.
//
// The offsets are the part that has to be right — they are what makeDoc exists to get right, and
// what every rule's expected spans are measured against. `unit`, `words[i].text` and the text a
// Finding's span slices out are all exact slices of the input: contractions, curly quotes, casing
// and all.
//
// Use it for lexical, formatting and most discourse rules. A rule that needs a tree (#10's copular
// and negation queries) has to run against the real analyzer — makeDoc will report every unit as
// unparseable, which is the honest answer when nothing parsed it.

import type { DocAnalysis, Span, UnitAnalysis, UnitOutcome, WordSpan } from "./types.js";

const TERMINATORS = ".!?;:";

// A word: letters/digits, with internal apostrophes and hyphens kept ("don't", "well-known",
// "won't" stay whole). Curly and straight apostrophes both count as internal.
const wordRe = () => /[\p{L}\p{N}]+(?:['‘’ʼ-][\p{L}\p{N}]+)*/gu;

// Trim whitespace off a candidate span; null if nothing is left.
function trimmed(text: string, start: number, end: number): Span | null {
  while (start < end && /\s/.test(text[start]!)) start++;
  while (end > start && /\s/.test(text[end - 1]!)) end--;
  return end > start ? { start, end } : null;
}

// Unit boundaries: after a run of . ! ? ; : (so "Wait?!" and "Not a bug..." stay one unit), and at
// any newline (a heading or a bullet is its own unit even without punctuation). The terminator
// belongs to the unit it ends — fragment rules care whether a unit ends in a period.
export function splitUnitSpans(text: string): Span[] {
  const spans: Span[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    const isTerm = TERMINATORS.includes(c);
    if (!isTerm && c !== "\n") continue;
    if (isTerm) while (i + 1 < text.length && TERMINATORS.includes(text[i + 1]!)) i++;
    const span = trimmed(text, start, isTerm ? i + 1 : i);
    if (span) spans.push(span);
    start = i + 1;
  }
  const last = trimmed(text, start, text.length);
  if (last) spans.push(last);
  return spans;
}

// Every word inside `span`, in order, with offsets into the whole text.
export function wordSpans(text: string, span: Span): WordSpan[] {
  const slice = text.slice(span.start, span.end);
  const words: WordSpan[] = [];
  const re = wordRe();
  for (let m = re.exec(slice); m; m = re.exec(slice)) {
    words.push({ text: m[0], span: { start: span.start + m.index, end: span.start + m.index + m[0].length } });
  }
  return words;
}

// Per-unit outcome. A constant applies to every unit; a function is called with the unit's text and
// index, so a fixture can mark unit 2 a fragment ("Not a bug.") without inventing a parse.
export type OutcomeOf = UnitOutcome | ((unit: string, index: number) => UnitOutcome);

// Default: every unit is "unparseable", which is the truth — nothing parsed it. Pass "fragment" (or
// a function) when a rule keys on fragment-ness. "lowered" is accepted but still carries no
// clauses, so a rule reading unit.clauses must guard on its presence, not on the outcome.
export function makeDoc(text: string, outcome: OutcomeOf = "unparseable"): DocAnalysis {
  const units: UnitAnalysis[] = splitUnitSpans(text).map((span, i) => {
    const unit = text.slice(span.start, span.end);
    const out = typeof outcome === "function" ? outcome(unit, i) : outcome;
    return {
      unit,
      span,
      outcome: out,
      ...(out === "lowered" ? {} : { reason: "stub document — nothing was parsed" }),
      words: wordSpans(text, span),
    };
  });
  return { text, units };
}

// The span of the nth (1-based) occurrence of `needle`, for writing an expected span without
// counting characters: expect(f.span).toEqual(spanOf(text, "not X — it's Y")). Throws when the
// occurrence is missing, so a fixture edited out from under a test fails loudly.
export function spanOf(text: string, needle: string, nth = 1): Span {
  let from = 0;
  for (let n = 0; n < nth; n++) {
    const at = text.indexOf(needle, from);
    if (at < 0) throw new Error(`spanOf: no occurrence ${n + 1} of ${JSON.stringify(needle)}`);
    if (n === nth - 1) return { start: at, end: at + needle.length };
    from = at + 1;
  }
  throw new Error(`spanOf: nth must be >= 1, got ${nth}`);
}

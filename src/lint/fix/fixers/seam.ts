// The three real fixers (#24) all do the same small pieces of character arithmetic: find where a
// unit's words stop and its terminal punctuation starts, decide whether an offset is starting a
// sentence, flip one letter's case, name the units a finding covers. Each piece is four lines and
// getting one of them subtly different in three files is exactly how a seam bug ships, so they live
// here once.
//
// Nothing in this file is a fixer and nothing in it constructs a TextEdit — it is offset and
// character arithmetic over the source, the same layer span.ts occupies for the rules.

import type { DocAnalysis, Span, UnitAnalysis, WordSpan } from "../../types.js";

// Sentence-final punctuation, matching the set both splitters (stub-doc.ts's TERMINATORS and
// document.ts's) treat as a unit boundary.
export const TERMINATORS = ".!?;:";

export const isTerminator = (c: string | undefined): boolean => c !== undefined && TERMINATORS.includes(c);

// Where a unit's WORDS stop: `end`, walked back over any trailing terminators and whitespace.
//
// This has to be computed rather than read off a span because the two analyzers disagree about it.
// stub-doc.ts keeps the terminator inside the unit ("Not a bug." spans [0,10)); document.ts's
// readDocument leaves it out ("Not a bug" spans [0,9)). A fixer that assumed either one would work
// under one analyzer and mangle punctuation under the other, so every fixer here asks this instead.
export function coreEnd(text: string, end: number): number {
  let i = Math.min(end, text.length);
  while (i > 0 && (isTerminator(text[i - 1]!) || /\s/.test(text[i - 1]!))) i--;
  return i;
}

// True when nothing but whitespace separates `at` from the start of the document or the end of the
// previous sentence — i.e. deleting from `at` leaves whatever follows starting a sentence, and the
// capital has to be handed on. Same test as fixers/demo.ts's startsUnit, and for the same reason.
export function startsUnit(text: string, at: number): boolean {
  let i = at - 1;
  while (i >= 0 && /\s/.test(text[i]!)) i--;
  return i < 0 || isTerminator(text[i]!);
}

export const isAlnum = (c: string | undefined): boolean => c !== undefined && /[\p{L}\p{N}]/u.test(c);
export const isUpper = (c: string | undefined): boolean => c !== undefined && /\p{Lu}/u.test(c);
export const isLower = (c: string | undefined): boolean => c !== undefined && /\p{Ll}/u.test(c);

// A word token, the way rules/fragments.ts counts them: anything carrying a letter or a digit, so a
// stray quote peeled off by the real tokenizer is never mistaken for a word.
export const isWordToken = (w: WordSpan): boolean => /[\p{L}\p{N}]/u.test(w.text);

export const wordsOf = (u: UnitAnalysis): WordSpan[] => u.words.filter(isWordToken);

// The units whose spans sit entirely inside `span`, in document order. This is how a fixer recovers
// the structure its rule found: rules/fragments.ts reports one span covering a run of units, and
// spanning() is not invertible — but containment is.
export const unitsWithin = (doc: DocAnalysis, span: Span): UnitAnalysis[] =>
  doc.units.filter((u) => u.span.start >= span.start && u.span.end <= span.end);

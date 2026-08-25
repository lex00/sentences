// The fixer vocabulary. Everything a fixer is allowed to say lives in this file, and the point of
// the file is what it CANNOT say: there is no edit kind that inserts novel text. A fix deletes the
// author's words, moves the author's words, or normalizes the punctuation and capitalization at the
// seams left behind. That is the whole grammar.
//
// This is the property no LLM rewrite has. A model asked to "de-stink" a paragraph returns new
// prose, and new prose can carry new tells — you cannot tell whether the fix helped without reading
// it. Here the output is a subsequence of the input plus a handful of commas and capitals, so the
// only question left is whether the finding count went down, and that is a number.
//
// These types are fix-local by design. src/lint/types.ts is the shared wave-1 contract and stays
// untouched; nothing outside src/lint/fix/ needs to know a fixer exists.

import type { DocAnalysis, Finding, Span } from "../types.js";

// ---------------------------------------------------------------------------------------------
// Finding identity
// ---------------------------------------------------------------------------------------------

// Findings have no id field, so the fixer framework defines one — here, once, and nowhere else.
//
// The identity is ruleId + span, and that is not an arbitrary choice: it is exactly the key
// runRules() dedupes on (engine.ts's dedupeKey). The engine already asserts that two findings with
// the same ruleId and span ARE the same finding, because it throws the second one away. Using any
// other identity here would mean the fixer and the engine disagree about what "the same finding"
// means.
//
// Deliberately NOT part of the identity: message and severity. Both are computed from
// document-wide density (see rules/demo.ts — three intensifiers read differently from one), so
// removing one instance rewrites the message of every instance left standing. If message were in
// the key, a fix that correctly deleted one tell would look like it had invented a finding at every
// other tell in the document, and the loop would reject every fix that ever worked.
export type FindingId = { ruleId: string; span: Span };

export const idOf = (f: Finding): FindingId => ({ ruleId: f.ruleId, span: { ...f.span } });

// Length-prefixed on the ruleId so no id containing ":" can collide with another id's key — same
// construction, and the same reason, as the engine's dedupe key.
export const keyOf = (id: FindingId): string => `${id.ruleId.length}:${id.ruleId}:${id.span.start}:${id.span.end}`;

export const findingKey = (f: Finding): string => keyOf(idOf(f));

// ---------------------------------------------------------------------------------------------
// The edit grammar
// ---------------------------------------------------------------------------------------------

// A single edit. Three kinds, and no fourth:
//
//   delete   drop the span. The author's remaining words are untouched and in order.
//   move     lift the span out and put it back down at `to`, an offset in the SAME (pre-edit)
//            coordinate system. Same words, different order — for the fixes that unwind a
//            "not X, but Y" back into plain assertion order.
//   repair   replace the span with `replacement`, where `replacement` is provably not new prose:
//            see isValidRepair below. This is what closes the seam a delete opens (the doubled
//            space, the orphaned comma, the sentence that now starts lowercase).
//
// There is no "insert" and no unrestricted "replace". A fixer that wants to add a word cannot.
export type TextEdit =
  | { kind: "delete"; span: Span }
  | { kind: "move"; span: Span; to: number }
  | { kind: "repair"; span: Span; replacement: string };

// One finding's worth of edits, applied together or not at all.
export type Fix = { findingId: FindingId; edits: TextEdit[] };

// How a rule proposes a fix for one of its own findings. `doc` is the analysis of the CURRENT text,
// re-run after every accepted step, so a fixer always reads offsets that are live. Returning null
// is the normal answer: most findings are for a human to fix, and a fixer that is unsure must say
// null rather than guess.
export type Fixer = (finding: Finding, doc: DocAnalysis) => Fix | null;

// The loop's view of every fixer at once: finding in, fix or nothing out. registry.ts builds one
// from the ruleId -> Fixer map; a test can pass a bare function instead.
export type FixProvider = (finding: Finding, doc: DocAnalysis) => Fix | null;

// ---------------------------------------------------------------------------------------------
// The repair invariant
// ---------------------------------------------------------------------------------------------

// The fixed, small alphabet a repair may add or remove at the edges of its span. Space, tab and
// newline for whitespace; comma, period and semicolon for the punctuation a deletion strands. No
// letters, no digits, no dashes — an em dash is a tell in its own right (#20) and a fixer does not
// get to hand one out.
export const REPAIR_AFFIX = new Set([" ", "\t", "\n", ",", ".", ";"]);

const isAffix = (c: string): boolean => REPAIR_AFFIX.has(c);

// The "core" of a string: what is left after stripping leading and trailing affix characters. The
// core is the part a repair is forbidden to touch (except for the case of its first letter), and
// stripping with the same alphabet on both sides is what makes the check symmetric.
export function repairCore(s: string): string {
  let start = 0, end = s.length;
  while (start < end && isAffix(s[start]!)) start++;
  while (end > start && isAffix(s[end - 1]!)) end--;
  return s.slice(start, end);
}

const isAlpha = (c: string): boolean => /\p{L}/u.test(c);

const firstAlphaIndex = (s: string): number => {
  for (let i = 0; i < s.length; i++) if (isAlpha(s[i]!)) return i;
  return -1;
};

// THE INVARIANT, enforced here and not merely described: a repair's replacement may differ from the
// original slice only by
//
//   (a) leading/trailing characters drawn from REPAIR_AFFIX, added or removed freely, and
//   (b) the case of the first alphabetic character of the core, and nothing else.
//
// Everything else is rejected: a different word, a reordered core, a smuggled em dash, a second
// capitalization deeper in the string, even a case change that alters length (ß -> SS fails the
// equal-length test and is refused rather than quietly allowed).
//
// The consequence the rest of the framework leans on: a valid repair CANNOT change which words are
// present. That is why remapping (apply.ts) can shift a finding through a repair instead of giving
// up on it, and why the loop's "no new finding" test stays honest.
export function isValidRepair(original: string, replacement: string): boolean {
  const a = repairCore(original);
  const b = repairCore(replacement);
  if (a === b) return true;
  if (a.length !== b.length) return false;

  // Find the single permitted difference and check it really is the only one.
  let diff = -1;
  for (let i = 0; i < a.length; i++) {
    if (a[i] === b[i]) continue;
    if (diff >= 0) return false; // two differences: not a case flip
    diff = i;
  }
  if (diff < 0) return true; // unreachable (a !== b), but harmless

  // The one difference must be at the first letter, in both strings, and must be a pure case flip.
  if (diff !== firstAlphaIndex(a) || diff !== firstAlphaIndex(b)) return false;
  const ca = a[diff]!, cb = b[diff]!;
  return ca.toLowerCase() === cb.toLowerCase() && isAlpha(ca) && isAlpha(cb);
}

// How far outside its finding's span a repair may reach. Deletes and moves get none of this — they
// must fall strictly inside the span the rule pointed at. A repair gets a bounded allowance because
// the seam it exists to close is by definition just outside the span: the space after the deleted
// word, the letter that has to be capitalized now the word in front of it is gone. Two characters
// on each side covers "the space, then the letter" and nothing more ambitious.
export const SEAM_CHARS = 2;

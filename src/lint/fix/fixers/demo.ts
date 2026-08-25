// DEMO FIXER — the reference implementation, paired with rules/demo.ts, and the thing #24's real
// fixers get copied from. It exists so the loop is exercised end to end on a real rule instead of
// on a mock, and so the seam handling has a worked example.
//
// What it does is the simplest possible fix and also the commonest one: the word adds emphasis and
// not meaning, so delete the word. Everything else in this file is the seam — the part that is
// fiddly in every fixer and that the TextEdit grammar deliberately makes hard to get wrong.
//
// The three shapes a deleted word leaves behind:
//
//   "is a very good idea"  ->  the space IN FRONT goes with the word, leaving "is a good idea".
//   "was quite."           ->  same: the space in front goes, leaving "was.".
//   "Very good, really."   ->  the word starts the sentence, so the space AFTER goes instead, and
//                              the capital it was carrying is handed to the next word: "Good, …".
//
// Note what the grammar refuses to let this fixer do. It cannot write "Good" — it can only ask for
// the "g" already in the text to change case (a repair, checked by isValidRepair). It cannot reach
// further than SEAM_CHARS past the finding to do it. So the worst bug it can have is a clumsy
// space, never a sentence the author did not write.

import type { DocAnalysis, Finding } from "../../types.js";
import type { Fix, TextEdit } from "../types.js";

// A unit boundary for the purpose of "is this word starting a sentence?". Mirrors stub-doc's
// TERMINATORS plus the newline it also splits on.
const TERMINATORS = ".!?;:\n";

// True when nothing but whitespace separates `at` from the start of the document or the end of the
// previous unit.
function startsUnit(text: string, at: number): boolean {
  let i = at - 1;
  while (i >= 0 && /\s/.test(text[i]!)) i--;
  return i < 0 || TERMINATORS.includes(text[i]!);
}

const isLower = (c: string | undefined): c is string => c !== undefined && /\p{Ll}/u.test(c);
const isUpper = (c: string | undefined): c is string => c !== undefined && /\p{Lu}/u.test(c);

export function demoIntensifierFixer(finding: Finding, doc: DocAnalysis): Fix | null {
  const text = doc.text;
  const { start, end } = finding.span;
  if (start >= end || end > text.length) return null;

  const edits: TextEdit[] = [{ kind: "delete", span: { start, end } }];
  const drop = (s: number, e: number): void => void edits.push({ kind: "repair", span: { start: s, end: e }, replacement: "" });

  if (startsUnit(text, start)) {
    // Nothing useful in front to absorb, so take the space behind and pass on the capital.
    if (text[end] === " ") {
      drop(end, end + 1);
      const next = text[end + 1];
      if (isUpper(text[start]!) && isLower(next)) {
        edits.push({ kind: "repair", span: { start: end + 1, end: end + 2 }, replacement: next.toUpperCase() });
      }
    }
  } else if (text[start - 1] === " ") {
    drop(start - 1, start);
  } else if (text[end] === " ") {
    drop(end, end + 1);
  }

  return { findingId: { ruleId: finding.ruleId, span: { start, end } }, edits };
}

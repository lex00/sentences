// TODO(#9): replace with analyzeDocument when it lands. This function is the seam: score.ts,
// report.ts and the CLI all consume DocAnalysis, never this function directly, so swapping the
// analyzer for #9's real one (which additionally fills in `tree` per unit) is a one-line change at
// each call site — this file, and nothing downstream of it, changes.
//
// Builds a DocAnalysis from readDocument's synchronous, rule-based per-unit split (document.ts) —
// the zero-download path the app already uses when no model is loaded, run one markdown BLOCK at a
// time (blocks.ts) rather than over the whole document at once.
//
// Per block because document.ts breaks sentences on `. ! ? ; :` and nothing else, which is correct
// inside a paragraph and wrong between blocks: a heading carries no terminator, so it used to fuse
// with the paragraph below it into a single unit, and `inKind(ctx, span, "heading")` then answered
// false for the fused span — quietly disabling the suppression every rule relies on to stay out of
// headings, bullets and fences. Splitting the text first and shifting the offsets back leaves
// document.ts untouched, which matters: it is shared with the Reed-Kellogg diagram path, where a
// document is a sentence somebody typed and markdown blocks are not a thing. Word-scanning mirrors
// stub-doc.ts's approach (one regex over each unit's span, offsets carried through from the
// source) rather than importing it: stub-doc.ts is documented test/fixture code, this is product
// code, and the two are allowed to drift independently.

import { readDocument } from "../document.js";
import { blockSpans } from "./blocks.js";
import type { DocAnalysis, DocUnit, Span, UnitAnalysis, WordSpan } from "./types.js";

// A word: letters/digits, with internal apostrophes and hyphens kept ("don't", "well-known",
// "won't" stay whole). Curly and straight apostrophes both count as internal. Mirrors stub-doc.ts's
// wordRe — see that file for the rationale.
const wordRe = (): RegExp => /[\p{L}\p{N}]+(?:['‘’ʼ-][\p{L}\p{N}]+)*/gu;

// Every word inside `span`, in order, with offsets into the whole text.
function wordSpans(text: string, span: Span): WordSpan[] {
  const slice = text.slice(span.start, span.end);
  const words: WordSpan[] = [];
  const re = wordRe();
  for (let m = re.exec(slice); m; m = re.exec(slice)) {
    words.push({ text: m[0], span: { start: span.start + m.index, end: span.start + m.index + m[0].length } });
  }
  return words;
}

const toUnitAnalysis = (text: string, unit: DocUnit): UnitAnalysis => ({ ...unit, words: wordSpans(text, unit.span) });

// The CLI's (and any other non-browser caller's) document analysis: real DocUnits from the
// rule-based chunker/parser, plus word spans scanned per unit. No tree, no POS tags — readDocument
// already says why a unit didn't lower, and nothing here parses further.
export function buildDocAnalysis(text: string): DocAnalysis {
  const units: UnitAnalysis[] = [];
  for (const block of blockSpans(text)) {
    const slice = text.slice(block.start, block.end);
    for (const unit of readDocument(slice)) {
      // readDocument reports offsets into the slice it was handed; a finding has to index the
      // document. Everything else about the unit (its text, its outcome, its clauses) is already
      // right — only the span moves.
      const shifted: DocUnit = { ...unit, span: { start: unit.span.start + block.start, end: unit.span.end + block.start } };
      units.push(toUnitAnalysis(text, shifted));
    }
  }
  return { text, units };
}

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
import { tag } from "../nlp/tagger.js";
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

// --- POS tags -----------------------------------------------------------------------------------

// The tagger's vocabulary (src/nlp/tagger.ts) is coarser than the Penn Treebank one the lexicons
// gate against, so only the gates it can actually answer are answered. RB and JJ map straight
// across. A verb is whatever the tagger forced to "V" plus the copulas, auxiliaries and modals,
// which is the same set document.ts calls verbal when deciding a unit is a fragment.
//
// NOUNS ARE DELIBERATELY ABSENT. The tagger's catch-all is "X", which covers nouns and also
// everything it could not place, so mapping X to NN would turn a shrug into a claim. The six
// noun-gated lexicon entries therefore keep failing closed, exactly as they did before, and that
// is a smaller lie than gating them on a tag that means "unknown".
const VERBAL_TAGS = new Set(["COP", "AUX", "MD"]);

function ptbTag(t: ReturnType<typeof tag>[number]): string | undefined {
  if (t.forced === "V" || VERBAL_TAGS.has(t.tag)) return "VB";
  if (t.tag === "RB") return "RB";
  if (t.tag === "JJ") return "JJ";
  return undefined;
}

// Walk the tagger's output alongside the scanned words, matching on lowercase text. The two
// tokenizers disagree (the tagger carries punctuation as its own entries and splits contractions
// differently), so this advances through the tagger's list looking for the next entry whose text
// matches, and simply leaves a word untagged when it cannot find one. An untagged word fails a POS
// gate closed, which is the behaviour every gated rule already handles.
function withPos(unitText: string, words: WordSpan[]): WordSpan[] {
  let tagged: ReturnType<typeof tag>;
  try {
    tagged = tag(unitText);
  } catch {
    return words; // a tagger failure must not take the document down
  }
  let i = 0;
  for (const w of words) {
    const lc = w.text.toLowerCase();
    let j = i;
    while (j < tagged.length && tagged[j]!.lc !== lc) j++;
    if (j >= tagged.length) continue; // no match ahead; leave this word untagged and keep going
    const pos = ptbTag(tagged[j]!);
    if (pos) w.pos = pos;
    i = j + 1;
  }
  return words;
}

const toUnitAnalysis = (text: string, unit: DocUnit): UnitAnalysis => ({
  ...unit,
  words: withPos(unit.unit, wordSpans(text, unit.span)),
});

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

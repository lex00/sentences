// analyzeDocument — the lint layer's read of a whole document. Splits the text into units, parses
// each one independently, and hands back an ORDERED unit list where every unit and every word
// carries a span into the original text. Two things fall out of that shape:
//
//   - a rule that flags a word ("delve", a repeated opener) can report characters, not token
//     indices, so an editor can underline the exact word the writer typed;
//   - a cross-sentence rule (anaphora, the "It's not X, it's Y" reframe, an opener repeated three
//     units running) can walk `units` in order and compare a unit with its neighbour.
//
// Like analyze(), this depends only on a minimal Parser (text -> Tree), so it is pure at runtime
// and testable with a stub; the caller supplies the real model. A unit that doesn't parse or
// doesn't lower is not fatal — it keeps its span and its words, and records `error`, because a
// fragment in the middle of a document must not blind the rules that run either side of it.

import type { Parser } from "../analyze.js";
import type { Sentence } from "../ir.js";
import type { SceneElement } from "../inspect.js";
import type { TextMetrics } from "../layout.js";
import { posTags } from "../ptb.js";
import { lowerSentence } from "../lower.js";
import { layout } from "../layout.js";
import { describeAll } from "../inspect.js";
import { defaultLayoutStyle } from "../theme.js";
import { tokenizeWithSpans } from "./offsets.js";
import type { DocAnalysis, DocUnit, UnitAnalysis, WordSpan } from "./types.js";

// A unit analysis plus the diagramming payload: the lowered clause IR and, when the caller supplied
// text metrics, the laid-out role-labeled elements. `error` says why one of those is missing.
export type DocumentUnit = UnitAnalysis & { sentence?: Sentence; elements?: SceneElement[]; error?: string };
export type DocumentAnalysis = DocAnalysis & { units: DocumentUnit[] };

export type AnalyzeDocumentOptions = {
  metrics?: TextMetrics; // omit to skip layout — rules that only read words/tags don't need it
  sizePx?: number;
};

// TODO(#7 integration): temporary unit splitter. Issue #7 rewrites src/document.ts to hand back
// per-unit DocUnit outcomes with exact source spans; when that lands, delete this and call it
// instead — analyzeDocument below consumes nothing but `DocUnit[]`, so the swap is one line.
// Splits on the same terminators src/document.ts uses (. ! ? ; :) and drops the terminator from the
// unit, matching what the parser is fed today.
export function splitUnits(text: string): DocUnit[] {
  const units: DocUnit[] = [];
  const push = (from: number, to: number) => {
    const raw = text.slice(from, to);
    const inner = raw.trim();
    if (!inner) return;
    const start = from + (raw.length - raw.trimStart().length);
    units.push({ text: inner, span: { start, end: start + inner.length } });
  };

  const term = /[.!?;:]+/g;
  let at = 0;
  for (let m = term.exec(text); m; m = term.exec(text)) {
    push(at, m.index);
    at = m.index + m[0]!.length;
  }
  push(at, text.length);
  return units;
}

export async function analyzeDocument(parser: Parser, text: string, opts: AnalyzeDocumentOptions = {}): Promise<DocumentAnalysis> {
  const units: DocumentUnit[] = [];
  for (const unit of splitUnits(text)) {
    // Tokenize against the unit's source slice, offset by where that slice starts, so the spans
    // come back document-absolute without ever re-searching the full text.
    const words = tokenizeWithSpans(unit.text, unit.span.start);
    const u: DocumentUnit = { ...unit, words };
    units.push(u);

    try {
      u.tree = await parser.parse(unit.text);
    } catch (e) {
      u.error = message(e);
      continue; // no tree — the unit keeps its span and its words
    }
    attachPos(words, posTags(u.tree));

    try {
      u.sentence = lowerSentence(u.tree);
    } catch (e) {
      u.error = message(e);
      continue;
    }
    if (opts.metrics) {
      const m = opts.metrics;
      u.elements = describeAll(layout(u.sentence, m, defaultLayoutStyle), m, opts.sizePx ?? defaultLayoutStyle.em);
    }
  }
  return { text, units };
}

// Adjacent (previous, next) unit pairs, in order — what a cross-sentence rule walks.
export const adjacentUnits = (doc: DocumentAnalysis): Array<[DocumentUnit, DocumentUnit]> =>
  doc.units.slice(1).map((u, i) => [doc.units[i]!, u]);

// Tag the words by position against the tree's preterminals. A real parser's leaves ARE the token
// stream (both come from tokenizeWords), so the common case is a straight index match; a stub or a
// tree built by hand may not line up, so fall back to a forward walk that only tags on an exact
// surface match and never goes backwards.
function attachPos(words: WordSpan[], tags: Array<{ word: string; tag: string }>): void {
  if (words.length === tags.length) {
    words.forEach((w, i) => { w.pos = tags[i]!.tag; });
    return;
  }
  let j = 0;
  for (const w of words) {
    const at = tags.findIndex((t, i) => i >= j && t.word === w.text);
    if (at < 0) continue;
    w.pos = tags[at]!.tag;
    j = at + 1;
  }
}

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e));

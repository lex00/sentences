// analyzeDocument — the lint layer's read of a whole document. Runs the document path (#7/#8) to
// get every unit's outcome and clauses, then maps each unit's tokens back to the characters the
// writer actually typed. Two things fall out of that shape:
//
//   - a rule that flags a word ("delve", a repeated opener) reports characters, not token indices,
//     so an editor can underline the exact word — see offsets.ts for why that mapping is exact;
//   - a cross-sentence rule (anaphora, the "It's not X, it's Y" reframe, an opener repeated three
//     units running) walks `units` in document order and compares a unit with its neighbour.
//
// Like analyze(), this depends only on the async Parser seam (text -> Tree), so it is pure at
// runtime and testable with a stub; pass ruleBasedParser for the zero-download default or a loaded
// ModelParser for neural-quality parses. A unit that doesn't parse is not a failure — it keeps its
// span, its words and its "fragment"/"unparseable" outcome, because a verbless fragment IS the
// signal a trope rule is looking for.

import type { Parser } from "../analyze.js";
import type { SceneElement } from "../inspect.js";
import type { TextMetrics } from "../layout.js";
import { readDocumentUnitsWith } from "../document.js";
import { posTags } from "../ptb.js";
import { lowerSentence } from "../lower.js";
import { layout } from "../layout.js";
import { describeAll } from "../inspect.js";
import { defaultLayoutStyle } from "../theme.js";
import { tokenizeWithSpans } from "./offsets.js";
import type { DocAnalysis, UnitAnalysis, WordSpan } from "./types.js";

// UnitAnalysis plus the drawn diagram, when the caller supplied text metrics. Everything else a
// unit carries — outcome, clauses, reason, tree, words — is already in the shared type.
export type DocumentUnit = UnitAnalysis & { elements?: SceneElement[] };
export type DocumentAnalysis = DocAnalysis & { units: DocumentUnit[] };

export type AnalyzeDocumentOptions = {
  metrics?: TextMetrics; // omit to skip layout — rules that only read words/tags don't need it
  sizePx?: number;
};

export async function analyzeDocument(parser: Parser, text: string, opts: AnalyzeDocumentOptions = {}): Promise<DocumentAnalysis> {
  const read = await readDocumentUnitsWith(parser, text);

  const units: DocumentUnit[] = read.map(({ doc: d, tree }) => {
    // Tokenize against the unit's source slice, offset by where that slice starts, so the spans
    // come back document-absolute without ever re-searching the full text.
    const u: DocumentUnit = { ...d, words: tokenizeWithSpans(d.unit, d.span.start) };

    if (!tree) return u; // no parser produced a tree for this unit; it keeps its words and outcome
    u.tree = tree;
    attachPos(u.words, posTags(tree));

    if (opts.metrics) {
      const m = opts.metrics;
      try {
        // Re-lower for the conjunctions: DocUnit carries clauses but not the gaps between them,
        // and layout needs a whole Sentence. Cheap and pure — it's the parse that costs.
        u.elements = describeAll(layout(lowerSentence(tree), m, defaultLayoutStyle), m, opts.sizePx ?? defaultLayoutStyle.em);
      } catch {
        // This tree didn't lower — the unit's clauses, if it has any, came from the rule-based
        // fallback inside readDocumentWith. No diagram; the words and spans are unaffected.
      }
    }
    return u;
  });

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

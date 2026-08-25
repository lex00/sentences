// token -> source offsets. Tokenization is lossy about *position*: "won't" comes back as two
// tokens, a period is peeled off the word it was glued to, and leading whitespace is trimmed away.
// A finding that says "word 4" is useless to an editor; it needs the characters. This module
// carries the offsets through the split so every token knows where it came from.
//
// What tokenizeWords (src/parser/model-parser.ts) actually does to the text:
//   1. .trim()                                  — drops leading/trailing whitespace
//   2. pads . , ! ? ; : " ( ) [ ] with spaces   — peels ASCII punctuation into its own token
//   3. "won't" -> "wo n't"                      — ASCII apostrophe only
//   4. "it's" -> "it 's" (also 're 've 'll 'd 'm) — ASCII apostrophe only
//   5. .split(/\s+/).filter(Boolean)
// Every one of those steps only *inserts spaces*. No character is ever deleted, replaced, lowercased
// or otherwise rewritten. So the invariant we lean on is:
//
//     tokenizeWords(t).join("") === t.replace(/\s+/g, "")
//
// which makes the mapping a single monotone left-to-right walk: skip whitespace, take the next
// token.length characters, done. No searching, no fuzzy matching, no ambiguity when the same word
// appears twice. offsets.test.ts asserts the invariant directly, so if the tokenizer ever starts
// rewriting characters the failure lands here rather than silently skewing every finding.
//
// Gotchas that fall out of the above, all handled by the walk:
//   - curly quotes/apostrophes are NOT in the punctuation class and \w does not match them, so
//     "won’t" stays one token and "“Really" keeps the quote glued to the word.
//   - a contraction's two tokens split the source word at the apostrophe: "wo" [0,2), "n't" [2,5).
//   - hyphens and dashes are never peeled: "well-known" and "--" are single tokens.

import { tokenizeWords } from "../parser/model-parser.js";
import type { WordSpan } from "./types.js";

const WS = /\s/; // same whitespace class .split(/\s+/) uses, incl. NBSP and friends

// Locate `tokens` in `text`, in order. `base` is added to every offset, so a caller holding a unit
// slice can pass the unit's document offset and get document-absolute spans back.
export function tokenSpans(text: string, tokens: string[], base = 0): WordSpan[] {
  const out: WordSpan[] = [];
  let cur = 0;
  for (const tok of tokens) {
    while (cur < text.length && WS.test(text[cur]!)) cur++;
    let start = cur;
    if (text.startsWith(tok, start)) {
      cur = start + tok.length;
    } else {
      // The invariant above says we never get here for a tokenizeWords stream. We do get here if a
      // caller hands us tokens from somewhere else, so degrade instead of throwing: prefer the next
      // literal occurrence, otherwise consume as many non-space characters as the token is long so
      // the walk stays monotone and later tokens still line up.
      const at = text.indexOf(tok, start);
      if (at >= 0) {
        start = at;
        cur = at + tok.length;
      } else {
        let n = 0;
        while (cur < text.length && n < tok.length) {
          if (!WS.test(text[cur]!)) n++;
          cur++;
        }
      }
    }
    out.push({ text: tok, span: { start: base + start, end: base + cur } });
  }
  return out;
}

// Tokenize and locate in one call — the normal entry point.
export const tokenizeWithSpans = (text: string, base = 0): WordSpan[] => tokenSpans(text, tokenizeWords(text), base);

// Shared contracts for the lint layer. Everything a rule reports has to point back at characters
// in the text the user actually typed, so a Span is always half-open char offsets into the
// ORIGINAL document text — never into a trimmed unit, a normalized token stream, or a re-joined
// sentence. Rules consume these; they never re-search the text themselves.

import type { Tree } from "../ptb.js";

// Half-open [start, end) char offsets into the original document text.
export type Span = { start: number; end: number };

// One surface word: `text` is the token as the tokenizer produced it, `span` locates the source
// characters it came from. `text.slice(span.start, span.end)` reproduces the original surface form.
export type WordSpan = { text: string; span: Span; pos?: string };

// A sentence-ish chunk of the document. `text` is the unit's source slice (already trimmed of the
// surrounding whitespace and its terminator); `span` is where that slice sits in the document.
export type DocUnit = { text: string; span: Span };

export type UnitAnalysis = DocUnit & { tree?: Tree; words: WordSpan[] };

export type DocAnalysis = { text: string; units: UnitAnalysis[] };

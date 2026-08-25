// Document splitter: break input on sentence boundaries (. ! ? ; :) into units and parse each
// independently. Two callers, one scan:
//
//   readDocument(text) -> DocUnit[]  — every unit, with its exact source span and what happened to
//     it. A unit that doesn't lower is KEPT as a "fragment" or "unparseable" record, because for
//     the linter a verbless fragment ("Not a bug. Not a feature.") IS the signal, not a failure.
//   parseDocument(text) -> Sentence  — the diagram path: merge the lowered units into one Sentence
//     whose clauses stack, dropping the rest. Coordinated clauses inside a unit keep their
//     conjunction; the gap BETWEEN units is null (separate sentences, drawn with no connector).
//
// Boundaries are found by scanning rather than String.split so every unit carries accurate char
// offsets into the ORIGINAL text: text.slice(span.start, span.end) === unit, terminating
// punctuation and surrounding whitespace excluded.

import { parse } from "./nlp/parse.js";
import { tag } from "./nlp/tagger.js";
import { lowerSentence } from "./lower.js";
import type { Sentence, Clause, Word } from "./ir.js";
import type { Tree } from "./ptb.js";
import type { DocUnit, Span } from "./lint/types.js";

const isBoundary = (ch: string): boolean => ch === "." || ch === "!" || ch === "?" || ch === ";" || ch === ":";
const isSpace = (ch: string): boolean => /\s/.test(ch);

// Split on runs of boundary punctuation, keeping exact spans. Empty units (a run of terminators,
// "?!", or leading whitespace) are dropped — they carry no text to parse.
export function splitUnits(text: string): Array<{ unit: string; span: Span }> {
  const out: Array<{ unit: string; span: Span }> = [];
  let i = 0;
  while (i < text.length) {
    let end = i;
    while (end < text.length && !isBoundary(text[end]!)) end++;
    let start = i;
    while (start < end && isSpace(text[start]!)) start++; // trim, adjusting the span with it
    let stop = end;
    while (stop > start && isSpace(text[stop - 1]!)) stop--;
    if (stop > start) out.push({ unit: text.slice(start, stop), span: { start, end: stop } });
    while (end < text.length && isBoundary(text[end]!)) end++; // eat the terminator run
    i = end;
  }
  return out;
}

// --- fragment vs. parser failure ---

// Verb-like by the tagger's own reckoning: a forced verb, a modal, a copula, or an auxiliary.
// A unit with none of these is verbless — a fragment, not a parse we botched.
const VERBAL = new Set(["MD", "COP", "AUX"]);
const hasVerb = (unit: string): boolean => tag(unit).some((t) => t.forced === "V" || VERBAL.has(t.tag));

const hasVP = (t: Tree): boolean => t.label === "VP" || t.children.some(hasVP);
const rootLabel = (t: Tree): string => {
  let n = t;
  while (["ROOT", "TOP", "S1", ""].includes(n.label) && n.children.length === 1 && n.children[0]) n = n.children[0];
  return n.label;
};

// The evidence a rule keys on: "no-VP" / "no-verb" mark a structurally verbless unit; anything
// else is the parser or the lowering falling over on a unit that does have a predicate.
const treeReason = (t: Tree, err: Error): string => `${rootLabel(t)}${hasVP(t) ? "" : "/no-VP"}: ${err.message}`;

// A unit's outcome plus, when it lowered, the Sentence it lowered to. DocUnit carries the clauses
// but not their conjunctions; the diagram path needs those, so it rides along here instead of
// widening the shared type.
type UnitResult = { doc: DocUnit; sentence?: Sentence };

// Lower one already-parsed unit, or say why it didn't.
function fromTree(unit: string, span: Span, tree: Tree): UnitResult {
  try {
    const sentence = lowerSentence(tree);
    return { doc: { unit, span, outcome: "lowered", clauses: sentence.clauses }, sentence };
  } catch (e) {
    const reason = treeReason(tree, e as Error);
    return { doc: { unit, span, outcome: hasVP(tree) ? "unparseable" : "fragment", reason } };
  }
}

// One unit through the rule-based path: parse, lower, and classify whatever went wrong.
function readUnit(unit: string, span: Span): UnitResult {
  let tree: Tree;
  try {
    tree = parse(unit);
  } catch (e) {
    const msg = (e as Error).message;
    const doc: DocUnit = hasVerb(unit)
      ? { unit, span, outcome: "unparseable", reason: msg }
      : { unit, span, outcome: "fragment", reason: `no-verb: ${msg}` };
    return { doc };
  }
  return fromTree(unit, span, tree);
}

// Every unit of the document in order, whatever happened to it. Zero silent drops.
export const readDocument = (text: string): DocUnit[] =>
  splitUnits(text).map((u) => readUnit(u.unit, u.span).doc);

// --- diagram path ---

// Stack the lowered units into one Sentence. Units that didn't lower are the ones the diagram
// can't draw, so they drop out here (and only here).
function mergeUnits(results: UnitResult[]): Sentence {
  const clauses: Clause[] = [];
  const conjunctions: Array<Word | null> = [];
  for (const { sentence } of results) {
    if (!sentence) continue;
    if (clauses.length > 0) conjunctions.push(null); // boundary between separate sentences
    clauses.push(...sentence.clauses);
    conjunctions.push(...sentence.conjunctions); // intra-unit coordination keeps its conjunctions
  }
  if (clauses.length === 0) throw new Error("nothing diagrammable");
  return { clauses, conjunctions };
}

export const parseDocument = (text: string): Sentence =>
  mergeUnits(splitUnits(text).map((u) => readUnit(u.unit, u.span)));

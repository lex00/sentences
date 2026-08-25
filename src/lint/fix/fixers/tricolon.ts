// TRICOLON TRIM — proposals for rules/tricolon.ts's `tricolon/density` finding (#24).
//
// A four- or five-item series is a list wearing a sentence's clothes, and the fix is to drop the
// item that is carrying the least. Which one that is, is a judgement about meaning — "identity,
// payments, compute, and distribution" has no weakest member a linter can name — so this file does
// NOT register an automatic fixer. It exports proposals(): one Fix per droppable item, each already
// validated against the same rules the loop would apply, for #25's UI to offer and a human to pick
// from. registry.ts registers a fixer that always returns null, so the loop leaves these findings
// alone and reports them instead.
//
//   before      The platform handles identity, payments, compute, and distribution.
//   drop 2      The platform handles identity, compute, and distribution.
//   drop 3      The platform handles identity, payments, and distribution.
//   drop 4      The platform handles identity, payments, and compute.
//
// --- why the series is read out of the SOURCE, not the IR ---
//
// The rule finds the series in the Clause IR, where `Compound.items` is exactly the list. But a
// Compound carries no offsets — a Word is `{ text, pos }` (src/ir.ts) — which is why the rule's own
// finding degrades to the enclosing UNIT's span. An edit needs offsets, so this file re-finds the
// series by scanning the unit's text: the last coordinating conjunction, then backwards across the
// commas in front of it. The two can in principle disagree (a parse could see a compound where the
// commas say otherwise); when the scan finds no 4+ series it returns no proposals rather than
// guessing, and the finding is simply reported to the reader unfixed.
//
// --- what the edit algebra could NOT express ---
//
// (The "drop 4" choice is withheld when the sentence carries on past the series — see
// lastItemIsDelimited. The comma-delimited choices are offered either way.)
//
// Item 1 is never droppable. Its right edge is the first comma, but its LEFT edge is wherever the
// series begins inside the clause, and "The platform handles identity" gives no signal for where
// "handles" stops and the first item starts — an English parser's job, and the IR that could answer
// it has no offsets. Dropping items 2..N always leaves a grammatical series, so a 4-item list still
// offers three choices and a 5-item list four.
//
// Dropping the LAST item is the only one of these that is not a plain deletion: cutting
// ", and distribution" would strand "identity, payments, compute" with no conjunction, and the
// framework cannot type a new "and" (there is no insert — see types.ts). So the conjunction already
// in the text is MOVED in front of the item that now ends the series, and the comma before it is
// deleted. Same words, fewer of them, no new ones.

import type { DocAnalysis, Finding, Span } from "../../types.js";
import type { Fix, TextEdit } from "../types.js";
import { coreEnd } from "./seam.js";

// The ruleId this file can act on. `tricolon/document-density` covers the whole document and names
// no series, so there is nothing to drop for it.
const ITEM_RULE_ID = "tricolon/density";

// The count at which the rule itself starts complaining (rules/tricolon.ts's LARGE_AT). Below it a
// series is an ordinary tricolon and trimming would take it under three.
const MIN_ITEMS = 4;

type Item = Span; // an item's own extent, trimmed, in source offsets

type Series = {
  items: Item[]; // every item, in order; items[0] is the un-droppable first one
  commas: number[]; // the offset of the comma in front of items[1..]; commas[i] precedes items[i+1]
  conj: Span; // the coordinating conjunction, without surrounding space
  end: number; // where the series stops (the unit's last word)
};

const trimSpan = (text: string, start: number, end: number): Span | null => {
  let s = start, e = end;
  while (s < e && /\s/.test(text[s]!)) s++;
  while (e > s && /\s/.test(text[e - 1]!)) e--;
  return e > s ? { start: s, end: e } : null;
};

// The last standalone "and" / "or" / "nor" in [start, end).
function lastConjunction(text: string, start: number, end: number): Span | null {
  const re = /\b(?:and|or|nor)\b/gi;
  const slice = text.slice(start, end);
  let hit: Span | null = null;
  for (let m = re.exec(slice); m; m = re.exec(slice)) hit = { start: start + m.index, end: start + m.index + m[0].length };
  return hit;
}

// Read the series out of the source. Returns null unless the shape is legible: a final conjunction,
// at least one comma before it, and no further comma or conjunction after it (either of those means
// the commas are not delimiting the series this rule found, and every offset below would be wrong).
function readSeries(text: string, span: Span): Series | null {
  const end = coreEnd(text, span.end);
  const conj = lastConjunction(text, span.start, end);
  if (!conj) return null;

  const tail = trimSpan(text, conj.end, end);
  if (!tail) return null;
  const tailText = text.slice(tail.start, tail.end);
  if (tailText.includes(",") || /\b(?:and|or|nor)\b/i.test(tailText)) return null;

  // Everything before the conjunction, cut on commas. A blank final chunk is the Oxford comma.
  const items: Item[] = [];
  const commas: number[] = [];
  let chunkStart = span.start;
  for (let i = span.start; i < conj.start; i++) {
    if (text[i] !== ",") continue;
    const item = trimSpan(text, chunkStart, i);
    if (!item) return null; // an empty chunk mid-series: not a shape worth editing
    items.push(item);
    commas.push(i);
    chunkStart = i + 1;
  }
  if (items.length === 0) return null; // "A and B": no commas, not a pile
  const trailing = trimSpan(text, chunkStart, conj.start);
  if (trailing) {
    items.push(trailing); // no Oxford comma: the chunk before "and" is an item
  } else {
    commas.pop(); // Oxford comma: the last comma introduces the conjunction, not an item
  }
  items.push(tail);
  return { items, commas, conj, end };
}

// Is the final item's RIGHT edge trustworthy? A middle item is delimited by commas on both sides, so
// its extent is not in doubt. The last item's right edge is wherever the sentence's series stops —
// and "Identity, payments, compute, and distribution matter here." puts a predicate after it with no
// punctuation to mark the join, so "distribution matter here" looks exactly like one long item.
//
// The signal available without a parser is length. Series items are written in parallel — the other
// items say what a member of this list looks like — so a final item much longer than any of them is
// not a member, it is a member plus something else. SLACK is one word, because parallel items do
// vary by about that much (a determiner, one adjective: "a bug" beside "a design flaw") while a
// trailing predicate does not; it is a threshold, chosen and stated, not a derivation.
//
// When this says no, only the last-item proposal is withheld. The middle ones are delimited by
// commas on both sides whatever the tail is doing, so they are still offered.
const SLACK = 1;
const wordCount = (text: string, s: Span): number => (text.slice(s.start, s.end).match(/[\p{L}\p{N}]+/gu) ?? []).length;

function lastItemIsDelimited(text: string, s: Series): boolean {
  const middles = s.items.slice(1, -1); // items[0] carries the clause's lead-in; the tail is what we are judging
  if (middles.length === 0) return false;
  const widest = Math.max(...middles.map((m) => wordCount(text, m)));
  return wordCount(text, s.items[s.items.length - 1]!) <= widest + SLACK;
}

// Dropping a middle item: delete it together with the comma in front of it.
const dropMiddle = (commaAt: number, item: Item): TextEdit[] => [
  { kind: "delete", span: { start: commaAt, end: item.end } },
];

// Dropping the final item: the conjunction moves in front of the item that now ends the series, the
// separator before it goes, and the item itself goes. `conj.start` back to the previous item's end
// covers ", " or " " either way, and the move span runs to the dropped item's start so it carries
// the space after the conjunction with it.
function dropLast(s: Series): TextEdit[] {
  const items = s.items;
  const last = items[items.length - 1]!;
  const prev = items[items.length - 2]!;
  return [
    { kind: "delete", span: { start: prev.end, end: s.conj.start } },
    { kind: "move", span: { start: s.conj.start, end: last.start }, to: prev.start },
    { kind: "delete", span: { start: last.start, end: s.end } },
  ];
}

/**
 * One Fix per droppable item of the finding's series, in series order: items 2..N-1 always, and
 * item N when its right edge is legible (lastItemIsDelimited). Empty when the source shows no
 * legible 4+ series at all (readSeries), which is the honest answer — better to report the pile
 * than to cut words the scan cannot delimit.
 *
 * Every returned Fix is contained by the finding's span and passes validateFix; the caller applies
 * one of them with applyEdits and re-lints, exactly as the loop would.
 */
export function tricolonProposals(finding: Finding, doc: DocAnalysis): Fix[] {
  if (finding.ruleId !== ITEM_RULE_ID) return [];
  const text = doc.text;
  const series = readSeries(text, finding.span);
  if (!series || series.items.length < MIN_ITEMS) return [];

  const id = () => ({ ruleId: finding.ruleId, span: { ...finding.span } });
  const out: Fix[] = [];
  for (let i = 1; i < series.items.length - 1; i++) {
    out.push({ findingId: id(), edits: dropMiddle(series.commas[i - 1]!, series.items[i]!) });
  }
  if (lastItemIsDelimited(text, series)) out.push({ findingId: id(), edits: dropLast(series) });
  return out;
}

// The number of choices a caller can offer, without building them.
export const tricolonProposalCount = (finding: Finding, doc: DocAnalysis): number => tricolonProposals(finding, doc).length;

// Registered in registry.ts so the rule id is spoken for and assertFixersHaveRules keeps checking
// it, but deliberately always null: choosing which item to cut is not a decision the autonomous
// loop is allowed to make. See the header.
export const tricolonNoAutoFix = (): null => null;

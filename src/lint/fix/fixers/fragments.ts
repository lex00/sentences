// FRAGMENT MERGE — the fix for rules/fragments.ts's `discourse/countdown` (#24).
//
// The countdown ("Not a bug. Not a feature. A fundamental design flaw.") is a run of negated
// fragments that exists only to delay the one clause carrying the point. The fix is to say the point
// first and demote the runway to a trailing contrast: move the capping clause to the front, and let
// the negations follow it as one comma-joined tail.
//
//   before   Not a bug. Not a feature. A fundamental design flaw.
//   after    A fundamental design flaw, not a bug, not a feature.
//
// --- what the edit algebra could NOT express, precisely ---
//
// Issue #24 illustrates the target as "A design flaw, not a bug or a feature." That string is NOT
// reachable and never will be under this framework, for a reason worth stating rather than
// working around: the word "or" does not occur in the input. TextEdit has delete, move and repair
// and no insert, and a repair's alphabet is " \t\n,.;" plus the case of one letter (types.ts's
// isValidRepair) — so no sequence of edits can put a letter on the page that the author did not
// type. Collapsing "not a bug" and "not a feature" into "not a bug or a feature" requires inventing
// "or" and deleting the second "not", which is a rewrite, not a fix.
//
// So the reachable form keeps both negations, joined by the comma the repair alphabet does contain:
//
//   "A fundamental design flaw, not a bug, not a feature."
//
// Every word of that output is a word of the input, in the input's own spelling; the only characters
// this fixer adds are two commas and a space, and the only letters it touches are the two capitals
// it lowercases and the one it does not have to (the cap already starts with one). The round-trip
// fixtures in fragments.test.ts pin that string, not the issue's illustrative one.
//
// --- how the moves land ---
//
// The cap is MOVED (not copied — there is no copy either) to the finding's start, minus its own
// terminal punctuation, because a move carries its span's characters verbatim and a repair may not
// overlap a move's source: the cap's own "." would be stranded mid-sentence with no way to reach
// it. Everything else is a seam repair on the gaps the units leave between them:
//
//   the first fragment's initial letter   "N" -> ", n"   (leading affix + a case flip: legal)
//   the gap between two fragments         ". " -> ", "
//   the gap before the cap                ". " -> "."    (the sentence's one terminator)
//   whatever trails the cap               "."  -> ""
//
// The last of those reaches up to SEAM_CHARS past the finding span on purpose: readDocument's unit
// spans exclude terminal punctuation, so on that path the countdown's own final "." sits just
// outside the span the rule reported. That is exactly the seam allowance's reason to exist.

import type { DocAnalysis, Finding, Span } from "../../types.js";
import type { Fix, TextEdit } from "../types.js";
import { SEAM_CHARS } from "../types.js";
import { coreEnd, isTerminator, isUpper, unitsWithin, wordsOf } from "./seam.js";

// The same literal test rules/fragments.ts uses to decide a unit opens a countdown step. Kept
// literal here too: this fixer must agree with the rule about which units are the runway.
const NEGATORS = new Set(["not", "no"]);
const opensWithNegator = (w: string | undefined): boolean => w !== undefined && NEGATORS.has(w.toLowerCase());

// A repair that rewrites [start, end) — used for every seam, since all of them are punctuation and
// whitespace only.
const seam = (span: Span, replacement: string): TextEdit => ({ kind: "repair", span, replacement });

// How far past the finding's end a trailing terminator run reaches, bounded by the seam allowance.
// On the readDocument path the countdown's closing "." lives here; on the stub-doc path it does not
// and this returns the span's own end.
//
// Terminators ONLY, never the whitespace after them: the space that separates this sentence from the
// next one is not part of the countdown, and eating it welds the fixed sentence onto its neighbour.
function tailEnd(text: string, end: number): number {
  let i = end;
  while (i < text.length && i < end + SEAM_CHARS && isTerminator(text[i]!)) i++;
  return i;
}

export function countdownMergeFixer(finding: Finding, doc: DocAnalysis): Fix | null {
  const text = doc.text;
  const fs = finding.span;
  if (fs.start >= fs.end || fs.end > text.length) return null;

  // Recover the rule's own structure from the span it reported: every unit inside it, the last one
  // being the cap and the rest the negated runway.
  const units = unitsWithin(doc, fs);
  if (units.length < 3) return null; // 2+ negated fragments and a cap; anything less is not a countdown
  const cap = units[units.length - 1]!;
  const run = units.slice(0, -1);
  if (!run.every((u) => opensWithNegator(wordsOf(u)[0]?.text))) return null;
  if (opensWithNegator(wordsOf(cap)[0]?.text)) return null;

  // The cap without its punctuation: what moves. Its terminal "." (wherever the analyzer put the
  // unit boundary) is handled by the tail repair below instead, because a move cannot be repaired.
  const capStart = cap.span.start;
  const capCore = coreEnd(text, cap.span.end);
  if (capCore <= capStart) return null;

  const first = run[0]!;
  const to = fs.start;
  if (to !== first.span.start) return null; // the finding must start where the runway starts
  if (to >= capStart) return null;

  const edits: TextEdit[] = [{ kind: "move", span: { start: capStart, end: capCore }, to }];

  // The runway's first letter also becomes the tail's first letter: demote the capital and hand it
  // the comma that joins it to the cap. ", n" is a legal repair of "N" — the comma and space are
  // leading affix characters, and the flip is the one case change isValidRepair allows.
  const head = text[first.span.start];
  if (head === undefined) return null;
  edits.push(seam({ start: first.span.start, end: first.span.start + 1 }, `, ${isUpper(head) ? head.toLowerCase() : head}`));

  // Every later fragment loses its capital the same way, without the comma (its own seam supplies
  // one). A fragment already lowercase is left alone rather than repaired to itself.
  for (const u of run.slice(1)) {
    const c = text[u.span.start];
    if (isUpper(c)) edits.push(seam({ start: u.span.start, end: u.span.start + 1 }, c!.toLowerCase()));
  }

  // The gaps: fragment-to-fragment becomes ", ", and the last fragment's gap to the cap becomes the
  // single "." that now ends the sentence.
  for (let i = 0; i + 1 < run.length; i++) {
    const gap = { start: coreEnd(text, run[i]!.span.end), end: run[i + 1]!.span.start };
    if (gap.end > gap.start) edits.push(seam(gap, ", "));
  }
  const lastGap = { start: coreEnd(text, run[run.length - 1]!.span.end), end: capStart };
  if (lastGap.end <= lastGap.start) return null; // no room for the terminator the output needs
  edits.push(seam(lastGap, "."));

  // Whatever punctuation trailed the cap is now mid-document and has to go, or the output ends "..".
  const tail = { start: capCore, end: tailEnd(text, fs.end) };
  if (tail.end > tail.start) edits.push(seam(tail, ""));

  return { findingId: { ruleId: finding.ruleId, span: { ...fs } }, edits };
}

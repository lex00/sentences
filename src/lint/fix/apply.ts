// Turning edits into text, and turning old offsets into new ones.
//
// Two jobs live here and they are the same job seen from both ends. Applying a fix rewrites the
// document; every finding the linter had already located now points at the wrong characters. The
// loop cannot ask "did a new finding appear?" until it can say where the OLD findings went — a
// finding that merely slid four characters left because a word upstream was deleted is the same
// finding, and calling it new would make every fix look like it caused damage.
//
// So: edits are lowered to splices, splices apply to text, and the same splices remap offsets.

import type { Span } from "../types.js";
import type { FindingId, Fix, TextEdit } from "./types.js";
import { SEAM_CHARS, isValidRepair } from "./types.js";

// The lowered form of an edit: replace [start, end) with `text`. A move lowers to two of these — a
// wide one that empties the source and a zero-width one that plants the words at the destination.
//
// `wordChanging` records whether this splice can alter WHICH words a span contains. Deletes and
// moves can; repairs provably cannot (see isValidRepair — a repair only touches edge punctuation
// and the case of one letter). That single bit is what lets remapSpan carry a finding through a
// repair instead of conservatively declaring it new.
export type Splice = { start: number; end: number; text: string; wordChanging: boolean };

const inBounds = (span: Span, len: number): boolean =>
  Number.isInteger(span.start) && Number.isInteger(span.end) && span.start >= 0 && span.end >= span.start && span.end <= len;

// Lower one edit. Throws with a specific message when the edit is malformed or when a repair breaks
// the invariant — the loop catches these and records the fix as rejected rather than crashing.
export function spliceFor(text: string, edit: TextEdit): Splice[] {
  if (!inBounds(edit.span, text.length)) {
    throw new Error(`edit span [${edit.span.start}, ${edit.span.end}) does not fit a ${text.length}-char document`);
  }
  const { start, end } = edit.span;
  switch (edit.kind) {
    case "delete":
      if (start === end) throw new Error("delete of an empty span does nothing");
      return [{ start, end, text: "", wordChanging: true }];

    case "repair": {
      const original = text.slice(start, end);
      if (!isValidRepair(original, edit.replacement)) {
        throw new Error(
          `repair ${JSON.stringify(original)} -> ${JSON.stringify(edit.replacement)} is not punctuation-and-case only`,
        );
      }
      return [{ start, end, text: edit.replacement, wordChanging: false }];
    }

    case "move": {
      if (!Number.isInteger(edit.to) || edit.to < 0 || edit.to > text.length) {
        throw new Error(`move destination ${edit.to} is outside a ${text.length}-char document`);
      }
      // The destination has to be genuinely elsewhere. Landing on either edge of the source is a
      // no-op dressed up as an edit, and landing inside it is meaningless.
      if (edit.to >= start && edit.to <= end) throw new Error(`move destination ${edit.to} is inside the span it moves`);
      if (start === end) throw new Error("move of an empty span does nothing");
      return [
        { start, end, text: "", wordChanging: true },
        { start: edit.to, end: edit.to, text: text.slice(start, end), wordChanging: true },
      ];
    }
  }
}

export const splicesFor = (text: string, edits: readonly TextEdit[]): Splice[] =>
  edits.flatMap((e) => spliceFor(text, e));

// Document order, with zero-width inserts sorting ahead of a wider splice that starts at the same
// offset so the walk below is deterministic.
const bySpliceOrder = (a: Splice, b: Splice): number => a.start - b.start || (a.end - a.start) - (b.end - b.start);

// Apply splices to text. Equivalent to splicing back-to-front, written as a single forward walk so
// the non-overlap check is the walk itself: the cursor never moves backwards, so a splice that
// starts before the cursor is an overlap, by construction and not by a separate pass that could
// drift out of sync with the application.
export function applySplices(text: string, splices: readonly Splice[]): string {
  const sorted = [...splices].sort(bySpliceOrder);
  let out = "";
  let cursor = 0;
  let lastInsertAt = -1;
  for (const sp of sorted) {
    if (sp.start < cursor) {
      throw new Error(`overlapping edits: [${sp.start}, ${sp.end}) starts before the previous edit ended at ${cursor}`);
    }
    if (sp.start === sp.end) {
      if (sp.start === lastInsertAt) throw new Error(`two insertions at offset ${sp.start}: their order is undefined`);
      lastInsertAt = sp.start;
    }
    out += text.slice(cursor, sp.start) + sp.text;
    cursor = sp.end;
  }
  return out + text.slice(cursor);
}

// The public entry point: sort, validate, apply. Edits within one call must not overlap.
export const applyEdits = (text: string, edits: readonly TextEdit[]): string =>
  applySplices(text, splicesFor(text, edits));

// ---------------------------------------------------------------------------------------------
// Containment: a fix may not reach outside the finding it is fixing
// ---------------------------------------------------------------------------------------------

// Returns null when the fix is well-formed, or a one-line reason why it is not.
//
// The rule a fixer has to obey: a delete or a move stays strictly inside the span its rule pointed
// at, and a move's destination stays inside that span too. A repair may reach up to SEAM_CHARS
// characters past either edge, because the seam it exists to close is just outside the span by
// definition — you delete "very" and the space after it, or the letter that now has to start the
// sentence, is one character past where the rule was looking.
export function validateFix(text: string, fix: Fix): string | null {
  const fs = fix.findingId.span;
  if (!inBounds(fs, text.length)) return `finding span [${fs.start}, ${fs.end}) does not fit the document`;
  if (fix.edits.length === 0) return "fix has no edits";

  for (const edit of fix.edits) {
    const { start, end } = edit.span;
    if (!inBounds(edit.span, text.length)) return `edit span [${start}, ${end}) does not fit the document`;
    if (edit.kind === "repair") {
      const lo = Math.max(0, fs.start - SEAM_CHARS);
      const hi = Math.min(text.length, fs.end + SEAM_CHARS);
      if (start < lo || end > hi) {
        return `repair [${start}, ${end}) reaches more than ${SEAM_CHARS} chars outside the finding span [${fs.start}, ${fs.end})`;
      }
    } else {
      if (start < fs.start || end > fs.end) {
        return `${edit.kind} [${start}, ${end}) falls outside the finding span [${fs.start}, ${fs.end})`;
      }
      if (edit.kind === "move" && (edit.to < fs.start || edit.to > fs.end)) {
        return `move destination ${edit.to} falls outside the finding span [${fs.start}, ${fs.end})`;
      }
    }
  }

  // Lowering and a dry-run application catch the rest: broken repairs, no-op moves, overlap.
  try {
    applySplices(text, splicesFor(text, fix.edits));
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// Remapping: where a pre-edit offset lands afterwards
// ---------------------------------------------------------------------------------------------

// The rules, stated once so #24 and the loop agree:
//
//   1. An offset o shifts by the total length delta of every splice that ENDS at or before o.
//      Everything downstream of an edit slides; everything upstream does not move.
//   2. An offset strictly inside a splice (start < o < end) has an image only if that splice is
//      length-preserving — that is, a pure case repair. Otherwise the character that offset used to
//      name is gone or has moved within the replacement, and there is no honest answer: null.
//   3. An offset sitting exactly on a zero-width insertion has no image either: it is ambiguous
//      whether it means "before the inserted words" or "after" them.
export function remapOffset(o: number, splices: readonly Splice[]): number | null {
  let delta = 0;
  for (const sp of [...splices].sort(bySpliceOrder)) {
    const width = sp.end - sp.start;
    if (sp.end <= o) {
      if (width === 0 && sp.start === o) return null; // rule 3
      delta += sp.text.length - width; // rule 1
      continue;
    }
    if (sp.start >= o) break; // wholly downstream; sorted, so everything after it is too
    if (sp.text.length !== width) return null; // rule 2
  }
  return o + delta;
}

//   4. A SPAN survives only if both endpoints survive AND no word-changing splice touches it: a
//      delete or a move overlapping [start, end), or a move's destination landing anywhere in
//      [start, end] including its edges. A span whose words were cut into or added to is not the
//      same span any more, and the loop must treat a finding there as new.
//   5. Repairs are exempt from rule 4 — not as a convenience but because isValidRepair makes it
//      true: a repair cannot add or remove a word, so the finding it touches is still the same
//      finding, only re-punctuated. It shifts by rule 1 like anything else.
export function remapSpan(span: Span, splices: readonly Splice[]): Span | null {
  for (const sp of splices) {
    if (!sp.wordChanging) continue; // rule 5
    const touches =
      sp.start === sp.end
        ? span.start <= sp.start && sp.start <= span.end // rule 4, insertion at an edge counts
        : sp.start < span.end && span.start < sp.end; // half-open overlap
    if (touches) return null;
  }
  const start = remapOffset(span.start, splices);
  const end = remapOffset(span.end, splices);
  return start === null || end === null ? null : { start, end };
}

// A finding's identity through an edit. null means "this finding cannot be followed across the
// edit" — the loop reads that as: anything the linter reports there afterwards is NEW.
export function remapId(id: FindingId, splices: readonly Splice[]): FindingId | null {
  const span = remapSpan(id.span, splices);
  return span === null ? null : { ruleId: id.ruleId, span };
}

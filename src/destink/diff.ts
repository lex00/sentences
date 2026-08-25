// Before/after diff ranges for the "apply mechanical fixes" UI, computed from fixLoop's own
// splices — no diff library, no independent LCS over the two strings. fixLoop (src/lint/fix/loop.ts)
// already knows exactly which characters moved and why; re-deriving that from scratch by comparing
// the original and final strings would be strictly less precise (a generic diff can't tell "this
// word was deleted" from "this word was replaced by a same-length coincidence").
//
// APPROACH: replay each accepted step's splices against a per-character "cell" array instead of a
// plain string. Each cell remembers which character of the ORIGINAL text it is (`origin`), or that
// it has no such ancestor (`origin: null`) because a repair or a move planted it there. After
// replaying every step, `origin` survival tells the whole story:
//   - an original index with no surviving cell was deleted -> highlight it in the BEFORE text.
//   - a final cell with origin: null is new punctuation/case from a repair -> highlight it in the
//     AFTER text.
// Both are reported as merged contiguous ranges, in their respective text's own coordinates
// (removed ranges index into `original`; added ranges index into the final text fixLoop returned).
import type { Splice } from "../lint/fix/index.js";

export type DiffRange = { start: number; end: number };
export type FixDiff = { removed: DiffRange[]; added: DiffRange[] };

type Cell = { ch: string; origin: number | null };

// Same ordering apply.ts's applySplices uses (not exported from there): sorted by start, then
// narrower-first at a tied start, so a zero-width insertion sorts ahead of a wider splice starting
// at the same offset. Replaying in a different order would misplace insertions relative to deletes
// that start at the same point.
const bySpliceOrder = (a: Splice, b: Splice): number => a.start - b.start || (a.end - a.start) - (b.end - b.start);

// Apply one step's splices to the cell array the same way applySplices applies them to a string,
// carrying `origin` through untouched cells and marking every inserted character `origin: null`.
//
// Known simplification: a move edit lowers into a delete-shaped splice at the source plus an
// insert-shaped splice (carrying the moved text) at the destination (apply.ts's spliceFor). Pairing
// those two back up to say "this exact character moved" would need information Splice[] doesn't
// keep once lowered. No shipped fixer moves anything yet — only the demo delete+repair fixer exists
// (fix/fixers/demo.ts) — so today a move would simply render as a delete at the source and an add at
// the destination, which is still an honest diff, just not phrased as "moved".
function applyCellSplices(cells: readonly Cell[], splices: readonly Splice[]): Cell[] {
  const sorted = [...splices].sort(bySpliceOrder);
  const out: Cell[] = [];
  let cursor = 0;
  for (const sp of sorted) {
    out.push(...cells.slice(cursor, sp.start));
    for (const ch of sp.text) out.push({ ch, origin: null });
    cursor = sp.end;
  }
  out.push(...cells.slice(cursor));
  return out;
}

// Sorted, deduped indices -> merged half-open ranges: [3,4,5,9] -> [{3,6},{9,10}].
function mergeRanges(indices: readonly number[]): DiffRange[] {
  const out: DiffRange[] = [];
  for (const i of indices) {
    const last = out[out.length - 1];
    if (last && last.end === i) last.end = i + 1;
    else out.push({ start: i, end: i + 1 });
  }
  return out;
}

// `steps` is FixLoopResult.steps (or any prefix of it) in the order fixLoop accepted them.
export function computeFixDiff(original: string, steps: readonly { splices: readonly Splice[] }[]): FixDiff {
  let cells: Cell[] = [];
  for (let i = 0; i < original.length; i++) cells.push({ ch: original[i]!, origin: i });
  for (const step of steps) cells = applyCellSplices(cells, step.splices);

  const survived = new Set<number>();
  for (const c of cells) if (c.origin !== null) survived.add(c.origin);

  const removedIdx: number[] = [];
  for (let i = 0; i < original.length; i++) if (!survived.has(i)) removedIdx.push(i);

  const addedIdx: number[] = [];
  cells.forEach((c, i) => { if (c.origin === null) addedIdx.push(i); });

  return { removed: mergeRanges(removedIdx), added: mergeRanges(addedIdx) };
}

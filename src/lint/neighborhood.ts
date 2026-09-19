// Looking at a sentence's neighbours.
//
// Rules see the whole document — `detect(doc)` gets every unit — so cross-sentence checks have
// always been first-class here. What was missing is a shared way to express them, so each rule
// grew its own: rules/anaphora.ts and rules/epistrophe.ts both define `WINDOW = 5` independently,
// rules/setup-turn.ts reaches for `units[i + 1]` by hand, and rules/reframe.ts walks consecutive
// clauses its own way.
//
// This matters more than tidiness. Measured over a 39,793-word corpus of the register this linter
// targets, against this repository's own documentation as a human-written baseline, every rule
// that separates the two is a cross-sentence rule:
//
//     reframe                     12.6x     tricolon/comma-series        1.4x
//     repetition/near-duplicate   12.4x     claude/colon-reveal          1.0x
//     anaphora/repeated-opening    6.0x     formatting/em-dash-density   0.6x
//     discourse/punchy-fragments   5.7x
//
// The single-sentence rules on the right do not discriminate at all; em-dash density is LOWER in
// the corpus than in hand-written prose. So the signal lives in how sentences sit next to each
// other, and that is worth a vocabulary rather than a habit.

import type { UnitAnalysis } from "./types.js";

// The default reach for "in a row". Five is what anaphora and epistrophe each arrived at
// independently: far enough that one stray sentence does not break a run, close enough that the
// reader is still hearing the repetition when it lands.
export const DEFAULT_WINDOW = 5;

export type Neighborhood = {
  index: number;
  unit: UnitAnalysis;
  before: UnitAnalysis | undefined;
  after: UnitAnalysis | undefined;
};

// Each unit with the one before and the one after it. For the adjacent-pair shape, which is what
// setup-turn and the reframe variants want.
export const neighborhoods = (units: readonly UnitAnalysis[]): Neighborhood[] =>
  units.map((unit, index) => ({ index, unit, before: units[index - 1], after: units[index + 1] }));

// Maximal runs of consecutive units sharing a key, longest-first from each starting point, with
// every unit claimed by at most one run.
//
// `key` returns null for a unit that cannot participate (too short, inside a heading, whatever the
// rule decides) and such a unit neither joins a run nor breaks one — it is simply skipped, which is
// why `window` counts distance rather than steps. A run of three openings with one aside between
// them is still a run a reader hears.
export function runsOf<K>(
  units: readonly UnitAnalysis[],
  key: (u: UnitAnalysis, i: number) => K | null,
  window: number = DEFAULT_WINDOW,
): { key: K; members: number[] }[] {
  const keys = units.map((u, i) => key(u, i));
  const claimed = new Set<number>();
  const runs: { key: K; members: number[] }[] = [];

  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    if (k === null || k === undefined || claimed.has(i)) continue;

    const members = [i];
    let last = i;
    for (let j = i + 1; j < keys.length && j - last < window; j++) {
      if (keys[j] === k) {
        members.push(j);
        last = j;
      }
    }
    if (members.length < 2) continue;
    for (const m of members) claimed.add(m);
    runs.push({ key: k, members });
  }
  return runs;
}

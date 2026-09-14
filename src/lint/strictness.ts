// The strictness dial.
//
// Every density threshold in this rule set is a bet about the reader's tolerance, and the bets are
// calibrated against deliberate human prose — see rules/trailing-tail.ts, whose floor is twice the
// rate measured across this repository's own documentation, or issue #35, where the em-dash
// threshold had to stop flagging Melville. That calibration is right for the default and wrong for
// the job somebody actually has. An editor working through a model's output does not care that
// Twain out-dashes three of five frontier models; they care that the shape appears at all, and they
// would rather read four false positives than miss one.
//
// So the floors move together, on one dial:
//
//   1  lenient   Floors doubled, severities eased one step. Report what is unambiguous and
//                nothing else. For prose with a human voice you are trying not to flatten.
//   2  standard  Exactly the behavior this rule set was calibrated to, and the default. Every
//                threshold is the number its own rule file argues for.
//   3  strict    Floors to ZERO and severities raised one step. A density gate stops gating: one
//                instance of a shape is reported the same as six. For output you already know came
//                from a model, where the question is not "is this a tic?" but "is this shape here
//                at all?".
//
// WHAT THE DIAL DOES NOT DO. It never invents a finding a rule could not otherwise make, and it
// never relaxes a rule's structural narrowing. Level 3 does not make rules/trailing-tail.ts report
// a relative clause, and level 1 does not make rules/reframe.ts miss a copular negation it has
// positively identified. The dial moves COUNTS and SEVERITIES; what counts as the shape at all is
// the rule's own business at every level, because a threshold is a judgment about how much is too
// much and a structural test is a judgment about what the thing is. Only the first one is a matter
// of taste.
//
// A rule that reads no strictness behaves identically at all three levels, which is the honest
// answer for a rule with no density component (rules/serves-as.ts either found the dodge or did
// not). Every rule that DOES vary says so in its own header.

import type { Severity } from "./types.js";

export const STRICTNESS_LEVELS = [1, 2, 3] as const;
export type Strictness = (typeof STRICTNESS_LEVELS)[number];

export const DEFAULT_STRICTNESS: Strictness = 2;

export const isStrictness = (n: unknown): n is Strictness =>
  STRICTNESS_LEVELS.includes(n as Strictness);

// --- floors ------------------------------------------------------------------------------------

// What a rule's density floor becomes at this level. Zero at level 3 is the whole point of the
// dial: a rule written as "fire when there are at least N of these" becomes "fire when there is
// one", because `hits.length >= 0` is true of any non-empty set of hits.
const FLOOR_FACTOR: Record<Strictness, number> = { 1: 2, 2: 1, 3: 0 };

export const floorAt = (floor: number, strictness: Strictness): number =>
  Math.ceil(floor * FLOOR_FACTOR[strictness]);

// The same dial applied to a per-1000-words RATE, which is a floor that happens not to be an
// integer. Kept separate so a reader of a rule can tell at a glance which kind of threshold is
// being moved.
export const rateAt = (rate: number, strictness: Strictness): number => rate * FLOOR_FACTOR[strictness];

// --- severities ---------------------------------------------------------------------------------

// The ladder score.ts weights (candidate 0.25, low 1, medium 2, high 4), in order.
export const SEVERITY_LADDER: readonly Severity[] = ["candidate", "low", "medium", "high"];

// Move a severity along the ladder, clamped at both ends. A finding cannot be eased below
// "candidate" or raised above "high"; there is nowhere else for it to go.
export function shiftSeverity(severity: Severity, steps: number): Severity {
  const at = SEVERITY_LADDER.indexOf(severity);
  if (at < 0) return severity;
  const next = Math.min(SEVERITY_LADDER.length - 1, Math.max(0, at + steps));
  return SEVERITY_LADDER[next]!;
}

// A rule's own severity, adjusted for the dial: eased one step at level 1, raised one at level 3.
// A rule calls this LAST, on the severity it already decided, so the dial never has to know what
// any individual rule's ladder means.
export const severityAt = (severity: Severity, strictness: Strictness): Severity =>
  shiftSeverity(severity, strictness === 3 ? 1 : strictness === 1 ? -1 : 0);

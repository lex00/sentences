// Fixtures for rules/contrast-tail.ts ("claude/contrast-tail") — the terminal ", not X" dismissal.
// Positive #1 is the closing clause of the post that motivated #34's recall round, reworded.
//
// The negatives are where this rule earns its keep: the same comma-plus-"not" silhouette appears in
// the because-variant (reframe.ts's territory), in short compressions that are ordinary English,
// and in tails that are really clauses. Each is kept out by a different one of the three tests in
// the rule's header.

import type { RuleFixtures } from "./types.js";

export const fixtures: RuleFixtures = {
  ruleId: "claude/contrast-tail",
  positives: [
    {
      text: "Bake governance into the design phase, not the end of the pipeline.",
      spanText: "not the end of the pipeline",
      note: "the motivating post's closing clause — a bare phrase denying something nobody proposed",
    },
    {
      text: "She chose the red one, not the blue one.",
      spanText: "not the blue one",
      note: "people write this on purpose; it is still the pattern, so it fires at candidate severity",
    },
    {
      text: "Ship the small safe change, never the grand rewrite.",
      spanText: "never the grand rewrite",
      note: "the 'never' opener, same shape",
    },
  ],
  negatives: [
    {
      text: "It was hard, not because of the schedule we agreed on.",
      note:
        "a reason, not an appositive: any tail carrying 'because' is reframe.ts's. The full " +
        "'not because X, but because Y' form belongs in contrast-tail.test.ts rather than here — " +
        "it is a POSITIVE for reframe, and the battery cross-checks every rule against every " +
        "other rule's negatives",
    },
    {
      text: "It was a mistake, not a crime.",
      note: "a three-word denial of a bare noun is ordinary compression, under the minimum tail length",
    },
    {
      text: "We shipped the parser, not having finished the renderer yet.",
      note: "the tail carries a verb, so it is a clause rather than the trailing phrase this rule is about",
    },
    {
      text: "The build failed twice, and nobody noticed until Friday.",
      note: "a trailing comma clause that is not a denial at all",
    },
  ],
};

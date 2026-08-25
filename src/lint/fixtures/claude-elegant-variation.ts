// Fixtures for rules/elegant-variation.ts (elegantVariationRule). No clauses needed anywhere: the
// rule reads determiner+noun token pairs and the synonym table, nothing structural.

import type { RuleFixtures } from "./types.js";

export const fixtures: RuleFixtures = {
  ruleId: "claude/elegant-variation",
  positives: [
    {
      text:
        "The vehicle arrived late that morning. This automobile had been repainted twice. " +
        "Said car was finally towed away.",
      spanText:
        "The vehicle arrived late that morning. This automobile had been repainted twice. Said car",
      note: "three names for one referent inside three units — the Fowler example, 'said car' included",
    },
    {
      text: "The report landed on Tuesday. This document ran to sixty pages. The paper was never read.",
      spanText: "The report landed on Tuesday. This document ran to sixty pages. The paper",
      note: "a second cluster cycling the same way — report/document/paper",
    },
  ],
  negatives: [
    {
      text: "The car arrived late that morning. A mechanic towed the car away. Nobody claimed the car afterwards.",
      note: "the same noun three times is repetition, not variation — dilution's territory, deliberately clean here",
    },
    {
      text: "The vehicle arrived late that morning. This automobile had been repainted twice.",
      note: "only two synonyms — two names for one thing is a word choice, three is a cycle",
    },
    {
      text: "Cars are expensive to insure. Vehicles depreciate quickly in the first year.",
      note: "generic bare plurals with no determiner: claims about a category, not a referent being renamed",
    },
  ],
};

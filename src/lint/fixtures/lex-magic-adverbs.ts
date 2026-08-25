// Fixtures for lexicons/magic-adverbs.ts, via lexMagicAdverbsRule. Every entry gates on
// posGate:"adverb"; see fixtures/lex-invented-concept-labels.ts's header for why the positives
// below carry posOverrides and the negatives include the same text without them.

import type { RuleFixtures } from "./types.js";

export const fixtures: RuleFixtures = {
  ruleId: "lex-magic-adverbs",
  positives: [
    {
      text: "This quietly changes everything about the approach.",
      spanText: "quietly",
      posOverrides: { quietly: "RB" },
      note: "posGate:adverb — fires once POS evidence says adverb",
    },
    {
      text: "The report arguably understates the risk.",
      spanText: "arguably",
      posOverrides: { arguably: "RB" },
    },
  ],
  negatives: [
    {
      text: "This quietly changes everything about the approach.",
      note: "posGate:adverb entry stays silent with no POS evidence at all (fails closed)",
    },
    { text: "The dog chased the ball across the yard.", note: "clean prose, no lexicon words at all" },
  ],
};

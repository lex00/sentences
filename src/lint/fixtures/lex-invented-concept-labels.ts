// Fixtures for lexicons/invented-concept-labels.ts, via lexInventedConceptLabelsRule. Every entry
// gates on posGate:"noun", and neither of the battery's doc-builders ever fills WordSpan.pos (see
// fixtures/types.ts's FORMAT EXTENSION note) — so the positives below supply pos via posOverrides,
// the same technique lexical.test.ts's own docWithPos helper uses, and the negatives include the
// identical text WITHOUT the override to pin the fails-closed behavior those rules are built for.

import type { RuleFixtures } from "./types.js";

export const fixtures: RuleFixtures = {
  ruleId: "lex-invented-concept-labels",
  positives: [
    {
      text: "This is workload creep.",
      spanText: "creep",
      posOverrides: { creep: "NN" },
      note: "posGate:noun — fires once POS evidence says noun",
    },
    {
      text: "This creates a real trap for newcomers.",
      spanText: "trap",
      posOverrides: { trap: "NN" },
      note: "posGate:noun — fires once POS evidence says noun",
    },
  ],
  negatives: [
    { text: "This is workload creep.", note: "posGate:noun entry stays silent with no POS evidence at all (fails closed)" },
    { text: "This creates a real trap for newcomers.", note: "same fails-closed behavior, no posOverrides supplied" },
    { text: "The dog chased the ball across the yard.", note: "clean prose, no lexicon words at all" },
  ],
};

// Fixtures for rules/false-range.ts (falseRangeRule). The token path fires off plain word shape
// with no parse (used for the plain-text cases below); the IR path needs real clauses and is
// exercised via needsClauses — both are mined from rules/false-range.test.ts's own acceptance
// examples.

import type { RuleFixtures } from "./types.js";

export const fixtures: RuleFixtures = {
  ruleId: "false-range/from-to",
  positives: [
    {
      text: "It goes from confusion to clarity of purpose eventually.",
      spanText: "from confusion to clarity of purpose eventually",
      note: "token path — no parse needed, always 'candidate' severity",
    },
    {
      text: "It moved from innovation to implementation to cultural transformation.",
      spanText: "from innovation to implementation to cultural transformation",
      needsClauses: true,
      note: "IR path through the real parser — 3-item chain, both ends abstract-suffixed, upgraded to medium",
    },
  ],
  negatives: [
    { text: "Support runs from nine to five most days.", note: "numeric idiom (9 to 5)" },
    { text: "We drove from Boston to New York for the weekend.", note: "place-to-place, both ends proper nouns" },
    { text: "It changed from time to time without warning.", note: "known idiom (time to time)" },
    { text: "The dog chased the ball across the yard.", note: "no from/to range at all" },
  ],
};

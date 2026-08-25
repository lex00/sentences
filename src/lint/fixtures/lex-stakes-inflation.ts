// Fixtures for lexicons/stakes-inflation.ts, via lexStakesInflationRule.

import type { RuleFixtures } from "./types.js";

export const fixtures: RuleFixtures = {
  ruleId: "lex-stakes-inflation",
  positives: [
    { text: "This will fundamentally reshape how we work.", spanText: "fundamentally reshape", note: "two-word phrase, exact span" },
    { text: "This is entirely new territory for the team.", spanText: "entirely new" },
  ],
  negatives: [
    { text: "This will change how we work next quarter.", note: "no trigger phrase present" },
    { text: "This is a new plan for the team.", note: "'new' alone, without 'entirely', is not a match" },
  ],
};

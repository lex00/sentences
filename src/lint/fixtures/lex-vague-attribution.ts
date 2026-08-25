// Fixtures for lexicons/vague-attribution.ts, via lexVagueAttributionRule.

import type { RuleFixtures } from "./types.js";

export const fixtures: RuleFixtures = {
  ruleId: "lex-vague-attribution",
  positives: [
    { text: "Experts argue that this approach has limitations.", spanText: "Experts argue" },
    { text: "Industry reports suggest adoption is accelerating.", spanText: "Industry reports suggest" },
  ],
  negatives: [
    { text: "The team believes this approach has limitations.", note: "no named-vague-source phrase; 'believes' is not tracked" },
    { text: "Our own data suggests adoption is accelerating.", note: "'suggests' alone, without the vague-source noun phrase, is not a match" },
  ],
};

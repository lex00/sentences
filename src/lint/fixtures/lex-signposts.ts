// Fixtures for lexicons/signposts.ts, via lexSignpostsRule.

import type { RuleFixtures } from "./types.js";

export const fixtures: RuleFixtures = {
  ruleId: "lex-signposts",
  positives: [
    { text: "In conclusion, this approach works.", spanText: "In conclusion", note: "below densityThreshold(2), downgraded but span still exact" },
    { text: "To sum up, the plan holds together.", spanText: "To sum up" },
  ],
  negatives: [
    { text: "This concludes our review of the topic.", note: "'concludes' is not the listed phrase 'in conclusion'" },
    { text: "The report ends with a short recommendation.", note: "no signpost phrase present" },
  ],
};

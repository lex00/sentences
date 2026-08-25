// Fixtures for lexicons/false-suspense.ts, via rules/lexical.ts's lexFalseSuspenseRule. Fixed
// phrases, essentially never used by accident, per the lexicon's own header comment.

import type { RuleFixtures } from "./types.js";

export const fixtures: RuleFixtures = {
  ruleId: "lex-false-suspense",
  positives: [
    {
      text: "Here's the kicker: nobody saw it coming.",
      spanText: "Here's the kicker",
      note: "fixed phrase, fires at full severity on a single occurrence",
    },
    { text: "Here's the deal with the new plan.", spanText: "Here's the deal" },
  ],
  negatives: [
    { text: "Here's the plan for tomorrow's meeting.", note: "'here's' alone is not a listed phrase" },
    { text: "The kicker on the team missed the field goal.", note: "'kicker' outside the fixed phrase 'here's the kicker'" },
  ],
};

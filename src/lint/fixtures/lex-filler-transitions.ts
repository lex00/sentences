// Fixtures for lexicons/filler-transitions.ts, via rules/lexical.ts's lexFillerTransitionsRule.
// Mined from rules/lexical.test.ts's multi-word contiguity case.

import type { RuleFixtures } from "./types.js";

export const fixtures: RuleFixtures = {
  ruleId: "lex-filler-transitions",
  positives: [
    {
      text: "It's worth noting that this holds in practice.",
      spanText: "It's worth noting",
      note: "contiguous 3-word phrase, first token a contraction",
    },
    { text: "Notably, the results held up.", spanText: "Notably", note: "single-word entry" },
  ],
  negatives: [
    { text: "It's, worth saying, noting how this reads.", note: "tokens not contiguous — must not match" },
    { text: "This note is worth keeping around.", note: "'worth' alone is not a listed phrase" },
  ],
};

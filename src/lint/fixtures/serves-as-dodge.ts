// Fixtures for rules/serves-as.ts (servesAsDodgeRule) — mined from serves-as.test.ts's "parser gap"
// describe block.
// Both frames fire through readDocument: the bare frame (mark/represent, plain transitives) always
// did, and the phrasal frame (serve as / stand as) does since the #33 chunker fix kept the as-phrase.

import type { RuleFixtures } from "./types.js";

export const fixtures: RuleFixtures = {
  ruleId: "serves-as-dodge",
  positives: [
    {
      text: "This documentary represents a turning point in independent filmmaking.",
      spanText: "represents",
      needsClauses: true,
      note: "bare frame (transitive 'represent') — the parser handles this fine today",
    },
    {
      text: "The building serves as a reminder of the city's heritage.",
      spanText: "serves",
      needsClauses: true,
      note: "phrasal frame — fires end-to-end since the #33 chunker fix kept the as-phrase",
    },
  ],
  negatives: [
    {
      text: "The marks on the wall are ugly.",
      needsClauses: true,
      note: "'marks' is the subject noun here, never the verb",
    },
    {
      text: "The district is represented by the senator.",
      needsClauses: true,
      note: "passive voice leaves clause.complement null — the bare frame's own requirement excludes it",
    },
  ],
};

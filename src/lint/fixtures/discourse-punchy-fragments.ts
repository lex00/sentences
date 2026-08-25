// Fixtures for rules/fragments.ts's punchyFragmentsRule — mined from fragments.test.ts.

import type { RuleFixtures } from "./types.js";

export const fixtures: RuleFixtures = {
  ruleId: "discourse/punchy-fragments",
  positives: [
    {
      text: "He published this. Openly. In a book. As a priest.",
      spanText: "Openly. In a book. As a priest",
      needsClauses: true,
      note: "a lowered opener then a run of 3 short verbless fragments — the tropes.fyi example",
    },
  ],
  negatives: [
    {
      text: "A cat slept through the afternoon on the porch. Sometimes intentional. " +
        "Rain fell steadily across the northern hills that evening. Birds gathered near a feeder by the fence. " +
        "Markets closed early ahead of the holiday weekend.",
      needsClauses: true,
      note: "exactly one intentional fragment among normal sentences — not a run, not dense enough",
    },
    { text: "Platforms do.", needsClauses: true, note: "parses as a complete two-word clause, not a fragment at all" },
  ],
};

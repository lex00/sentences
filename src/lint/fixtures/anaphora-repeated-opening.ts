// Fixtures for rules/anaphora.ts (anaphoraRule) — mined from anaphora.test.ts.

import type { RuleFixtures } from "./types.js";

export const fixtures: RuleFixtures = {
  ruleId: "anaphora/repeated-opening",
  positives: [
    {
      text: "They assume users will pay. They assume developers will build. They assume ecosystems will emerge.",
      spanText: "They assume users will pay. They assume developers will build. They assume ecosystems will emerge",
      needsClauses: true,
      note: "3 repeated subject heads via real clauses, within the 5-unit window",
    },
    {
      text: "Not a bug. Not a trick. Not a flaw.",
      spanText: "Not a bug. Not a trick. Not a flaw.",
      note: "fragment fallback — no clauses at all, first-two-word key 'Not a'",
    },
  ],
  negatives: [
    {
      text: "The team shipped the release early. The team celebrated after work.",
      needsClauses: true,
      note: "2 repeats of the same subject head is under the 3+ threshold — not yet anaphora",
    },
    { text: "The dog ran fast. A cat slept well. Birds sang in the trees.", note: "every sentence opens differently" },
  ],
};

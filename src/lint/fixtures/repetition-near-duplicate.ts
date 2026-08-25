// Fixtures for rules/repetition.ts's nearDuplicateRule — mined from repetition.test.ts.

import type { RuleFixtures } from "./types.js";

const para = "The quarterly report shows revenue increased significantly across all major regions this year.";
const pastedTwice = `${para} ${para}`;

export const fixtures: RuleFixtures = {
  ruleId: "repetition/near-duplicate",
  positives: [
    {
      text: pastedTwice,
      spanText: para,
      nth: 2,
      note: "a paragraph pasted twice — the finding spans the LATER duplicate",
    },
  ],
  negatives: [
    {
      text: "The dog chased the ball. A different cat slept on the warm windowsill all afternoon.",
      note: "unrelated sentences, no overlap",
    },
    { text: "Yes. No. Maybe. Sure.", note: "units too short to compare — they'd trivially collide on 4-grams" },
  ],
};

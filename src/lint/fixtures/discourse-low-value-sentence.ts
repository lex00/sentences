// Fixtures for discourse/low-value-sentence — a whole sentence inside a paragraph of more than 50
// words whose every content word is already on the page. The near-misses are the interesting half:
// the same restatement in a SHORT paragraph, the same restatement one paragraph later, and a
// sentence that recycles almost everything but brings two new words with it.

import type { RuleFixtures } from "./types.js";

// 34 words. Long enough that one more ordinary sentence carries a paragraph past the gate.
const LEAD =
  "The scheduler rewrite cost us two quarters and shipped in March, a full release behind the roadmap " +
  "we had published in January. Every downstream team planned against that roadmap and had to replan twice.";

export const fixtures: RuleFixtures = {
  ruleId: "discourse/low-value-sentence",
  positives: [
    {
      text: `${LEAD} The rewrite of the scheduler was what cost those two quarters. Nobody on the platform side had budgeted for a second replan.`,
      spanText: "The rewrite of the scheduler was what cost those two quarters.",
      note: "rewrite, scheduler, cost, two and quarters are all already in the paragraph — the sentence is deletable",
    },
    {
      text: `${LEAD} The scheduler rewrite cost two quarters against the roadmap that every downstream team had planned against, belatedly.`,
      spanText:
        "The scheduler rewrite cost two quarters against the roadmap that every downstream team had planned against, belatedly.",
      note: "ten content words, one of them new: reported as a candidate, not a confirmed finding",
    },
  ],
  negatives: [
    {
      text: "The scheduler rewrite cost us two quarters. The rewrite of the scheduler was what cost those two quarters.",
      note: "the identical restatement, in a paragraph short enough that a reader can still see both sentences",
    },
    {
      text: `${LEAD}\n\nThe rewrite of the scheduler was what cost those two quarters. Hiring slowed to a trickle through the same period, and the two open roles on the platform team stayed open into the summer while recruiting worked a backlog.`,
      note: "a new paragraph may pick up the previous one's vocabulary — that is how paragraphs connect",
    },
    {
      text: `${LEAD} The scheduler rewrite also broke the nightly export job that finance had been reading every Monday.`,
      note: "recycles scheduler and rewrite, but brings real new material with it",
    },
    {
      text: `${LEAD} So the rewrite failed. Nobody on the platform side had budgeted for that outcome at all.`,
      note: "two content words, both echoes — a short conclusion, not padding",
    },
  ],
};

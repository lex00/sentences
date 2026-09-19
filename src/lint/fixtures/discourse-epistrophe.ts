// Fixtures for discourse/epistrophe — the repeated sentence ending. The positives are runs of
// three or more consecutive sentences landing on the same two words; the negatives are the shapes
// that look like it and are not.
//
// The "sentence IS its own ending" case ("It is. It is. It is.") is pinned in epistrophe.test.ts
// rather than here: three sentences opening the same way is genuinely anaphora, so as a fixture
// negative the battery's cross-rule check would rightly fire on it.

import type { RuleFixtures } from "./types.js";

const RUN =
  "But the reason is gone. The regulatory requirement that created the rule is gone. " +
  "The payment processor constraint that made the ugly version necessary is gone.";

export const fixtures: RuleFixtures = {
  ruleId: "discourse/epistrophe",
  positives: [
    {
      text: RUN,
      spanText:
        "But the reason is gone. The regulatory requirement that created the rule is gone. The payment processor constraint that made the ugly version necessary is gone.",
      profile: "rate",
      note: "three consecutive sentences steered onto the same two closing words; a run length is a threshold claim, so the doubled floor at level 1 silences it by design",
    },
  ],
  negatives: [
    {
      text: "But the reason is gone. The requirement still stands. The constraint was written down.",
      note: "three sentences, three different endings",
    },
    {
      text: "The reason is gone. The requirement is gone.",
      profile: "rate",
      note: "two is a pair, not a run — under the floor at the default level",
    },
    {
      text: "The parser reads the input. Then it resolves the names. Finally it emits the code.",
      note: "ordinary sequential prose, no repeated landing",
    },
  ],
};

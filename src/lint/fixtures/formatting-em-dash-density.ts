// Fixtures for rules/formatting.ts's emDashDensityRule — mined from formatting.test.ts.

import type { RuleFixtures } from "./types.js";

const filler = Array(200).fill("word").join(" ");
const twoDash = `${filler} one — two -- three`; // 2 dashes over ~203 words => ~9.85/1000 (high)

export const fixtures: RuleFixtures = {
  ruleId: "formatting/em-dash-density",
  positives: [
    { text: twoDash, spanText: "—", note: "em dash occurrence, high density (>=6/1000)" },
    { text: twoDash, spanText: "--", note: "double-hyphen-as-dash occurrence, same document" },
  ],
  negatives: [
    {
      text: "This sentence has one dash — right there, and nothing else remarkable at all here today.",
      note: "a single em dash never fires — the rule requires at least 2 occurrences before density is even computed",
    },
  ],
};

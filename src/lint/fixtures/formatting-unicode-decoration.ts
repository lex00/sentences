// Fixtures for rules/formatting.ts's unicodeDecorationRule — mined from formatting.test.ts. Each
// positive isolates one category (arrow / curly quote / decorative symbol) so its span is simple —
// spanning() covers first-hit to last-hit within a category, which for a lone hit is just that hit.

import type { RuleFixtures } from "./types.js";

export const fixtures: RuleFixtures = {
  ruleId: "formatting/unicode-decoration",
  positives: [
    { text: "Now go → build it.", spanText: "→", note: "unicode arrow" },
    { text: "She said “hello” to no one.", spanText: "“hello”", note: "curly double quotes, spanning across the quoted word" },
    { text: "Great news ✨ today.", spanText: "✨", note: "decorative symbol" },
  ],
  negatives: [
    {
      text: "Input -> processing -> output. \"Quoted\" and don't worry about it.",
      note: "plain ASCII arrows and straight quotes; the apostrophe in don't sits between letters",
    },
  ],
};

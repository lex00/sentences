// Fixtures for lexicons/pedagogical-voice.ts, via lexPedagogicalVoiceRule.

import type { RuleFixtures } from "./types.js";

export const fixtures: RuleFixtures = {
  ruleId: "lex-pedagogical-voice",
  positives: [
    { text: "Let's break this down into three parts.", spanText: "Let's break this down" },
    {
      text: "It's like a puzzle with missing pieces.",
      spanText: "It's like a",
      note: "generic analogy opener, scored low on its own per the lexicon's own note",
    },
  ],
  negatives: [
    { text: "Let's meet tomorrow for coffee instead.", note: "'let's' alone is not a listed phrase" },
    { text: "The plan worked out fine in the end.", note: "no teacher-voice phrase present" },
  ],
};

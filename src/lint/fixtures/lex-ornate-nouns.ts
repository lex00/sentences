// Fixtures for lexicons/ornate-nouns.ts, via lexOrnateNounsRule.

import type { RuleFixtures } from "./types.js";

export const fixtures: RuleFixtures = {
  ruleId: "lex-ornate-nouns",
  positives: [
    {
      text: "The rich tapestry of the story unfolds slowly.",
      spanText: "tapestry",
      note: "carries its own severity override (medium), fires alone",
    },
    { text: "It was a real synergy between the two teams.", spanText: "synergy" },
  ],
  negatives: [
    {
      text: "The paradigmatic approach worked well for the team.",
      note: "'paradigm' must not match inside 'paradigmatic' (word boundary)",
    },
    {
      text: "The ecosystems here are diverse and healthy.",
      note: "entry is 'ecosystem' with no lemma flag — the plural 'ecosystems' is a different token, no match",
    },
  ],
};

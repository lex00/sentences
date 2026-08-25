// Fixtures for rules/ing-tackon.ts (ingTackOnRule). Per the retrofit's known-limits guidance: path
// 1 (IR-based) cannot fire through readDocument today (the rule-based chunker drops the trailing
// participle before lower.ts ever sees it — see ing-tackon.ts's PARSER GAP note and
// ing-tackon.test.ts's "parser gap" describe block, confirmed there by hand against this exact
// sentence). Path 2 (the token-shape fallback) works off plain text and IS what fires through this
// battery's doc-builders — fixture that, and leave path 1 to ing-tackon.test.ts's hand-built Clause
// fixtures.

import type { RuleFixtures } from "./types.js";

export const fixtures: RuleFixtures = {
  ruleId: "ing-tackon",
  positives: [
    {
      text: "The station opened in 1994, highlighting its importance.",
      spanText: "highlighting",
      note: "path 2 token-shape fallback: comma + listed -ing verb near the unit's end, no parse involved",
    },
  ],
  negatives: [
    { text: "The team kept highlighting the same risks all quarter.", note: "no comma preceding the -ing word" },
    { text: "He wrote the report, laughing the whole time.", note: "'laughing' is not in the superficial-ing lexicon" },
    {
      text: "Contributing to the team's success, she was promoted twice in two years after joining.",
      note: "leading participle — the -ing word itself has no preceding comma (it's the first word), so path 2 does not match",
    },
  ],
};

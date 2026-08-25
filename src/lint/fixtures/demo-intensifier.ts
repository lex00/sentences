// Fixtures for the demo rule (rules/demo.ts) — the worked example for issue #12. Every other rule's
// fixture file should follow this shape: filename is the rule id with "/" replaced by "-".

import type { RuleFixtures } from "./types.js";

export const fixtures: RuleFixtures = {
  ruleId: "demo/intensifier",
  positives: [
    { text: "This is a very good idea.", spanText: "very", note: "plain filler intensifier" },
    {
      text: "It is really quite clever and truly remarkable somehow.",
      spanText: "quite",
      note: "second intensifier in a denser sentence — still fires on its own span",
    },
    {
      text: "very very good",
      spanText: "very",
      nth: 2,
      note: "nth picks out the second occurrence, not the first",
    },
    { text: "Really, this changes everything.", spanText: "Really", note: "matching is case-insensitive" },
  ],
  negatives: [
    {
      text: "This is a veritable triumph.",
      note: "contains the letters of \"very\" but as part of a longer word — word-boundary matching must not fire",
    },
    { text: "The reality is complex.", note: "\"real\" is not \"really\" — no shared word" },
    { text: "Truthfully, this is fine.", note: "\"truthfully\" is not \"truly\"" },
    { text: "Quitting isn't easy.", note: "\"quit\" is not \"quite\"" },
    { text: "The dog chased the ball across the yard.", note: "clean prose, no intensifiers at all" },
  ],
};

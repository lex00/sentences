// Fixtures for rules/corporate-jargon.ts (issue #34's consolidation pass).
import type { RuleFixtures } from "./types.js";

export const fixtures: RuleFixtures = {
  ruleId: "corporate-jargon",
  positives: [
    {
      text: "We need to move the needle before the board meeting.",
      spanText: "move the needle",
    },
    {
      text: "That's a classic case of low-hanging fruit.",
      spanText: "low-hanging fruit",
    },
    {
      text: "Let's take this offline and follow up next week.",
      spanText: "take this offline",
    },
  ],
  negatives: [
    {
      text: "The fruit stand was low on hanging baskets again this week.",
      note: "\"low on hanging\" isn't the hyphen-compound token \"low-hanging\" followed by \"fruit\" — no contiguous phrase match",
    },
    {
      text: "The team finally circled the wagons before the launch.",
      note: "\"circled the wagons\", not \"circle back\" — different phrase entirely",
    },
    {
      text: "The team shipped the feature after two weeks of testing.",
      note: "clean prose, no corporate-jargon phrases at all",
    },
  ],
};

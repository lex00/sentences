// Fixtures for rules/claude-figurative.ts (claudeFigurativeSuffixesRule) — the four pattern-shaped
// checks: "-shaped", "-adjacent", "-flavored", "the X story", and the "load-bearing" literal gate.

import type { RuleFixtures } from "./types.js";

export const fixtures: RuleFixtures = {
  ruleId: "claude/figurative-suffixes",
  positives: [
    { text: "That role is basically agent-shaped.", spanText: "agent-shaped", note: "-shaped on an abstract noun" },
    { text: "The config format is API-shaped.", spanText: "API-shaped", note: "-shaped on an abstract acronym" },
    {
      text: "There's a Y-shaped hole in the org chart.",
      spanText: "Y-shaped",
      note: "a single letter that isn't on the physical-shape allowlist still fires",
    },
    { text: "This vendor is crypto-adjacent.", spanText: "crypto-adjacent", note: "-adjacent, no allowlist for this suffix" },
    { text: "The new format is JSON-flavored.", spanText: "JSON-flavored", note: "-flavored on a non-food word" },
    {
      text: "We need to nail down the deployment story before launch.",
      spanText: "the deployment story",
      note: "\"the X story\" borrowed for a technical process",
    },
    {
      text: "Nobody has thought through the error-handling story here.",
      spanText: "the error-handling story",
      note: "\"the X story\" with a hyphenated technical noun",
    },
    {
      text: "That helper function is load-bearing for the whole pipeline.",
      spanText: "load-bearing",
      note: "figurative sense (no structural noun follows) — high severity",
    },
  ],
  negatives: [
    { text: "The bakery sells a star-shaped cookie every December.", note: "star is on the physical-shape allowlist" },
    { text: "The architect wanted an L-shaped desk for the corner.", note: "L is on the physical-shape allowlist" },
    { text: "The candy is cherry-flavored.", note: "cherry is on the food allowlist for -flavored" },
    { text: "The room adjacent to the lobby was quiet.", note: "\"adjacent\" alone, not the \"-adjacent\" suffix on another word" },
    { text: "She told a bedtime story about a dragon.", note: "\"a bedtime story\", not \"the X story\", and bedtime is story-legit anyway" },
    { text: "This is the origin story everyone already knows.", note: "\"origin\" is on the story-legit allowlist" },
    { text: "The load-bearing wall cracked during the renovation.", note: "literal gate: load-bearing immediately before a structural noun stays clean" },
    { text: "Two load-bearing columns held up the mezzanine.", note: "literal gate: plural structural noun also stays clean" },
    { text: "The dog chased the ball across the yard.", note: "clean prose, none of the four patterns present" },
  ],
};

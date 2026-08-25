// Fixtures for rules/aphoristic-ender.ts (aphoristicEnderRule). Every case needs real clauses: the
// rule's grammar test is "verbless (document.ts's outcome === 'fragment') OR copular", and the
// parser-free makeDoc stub calls every unit "unparseable", which is neither.
//
// The two long opening sentences in each fixture are the runway the rule requires (>= 2 units of 9+
// words before the ender); shortening them is what negative #3 tests.

import type { RuleFixtures } from "./types.js";

const RUNWAY =
  "The migration took three quarters and touched every service we own. " +
  "We rewrote the scheduler twice before the numbers finally moved.";

export const fixtures: RuleFixtures = {
  ruleId: "claude/aphoristic-ender",
  positives: [
    {
      text: `${RUNWAY} A choice, not an accident.`,
      spanText: "A choice, not an accident",
      needsClauses: true,
      note: "verbless ender with a bare 'X, not Y' tail, after two full-length sentences",
    },
    {
      text: `${RUNWAY} The rollout was a stance, not its absence.`,
      spanText: "The rollout was a stance, not its absence",
      needsClauses: true,
      note: "copular ender with a comma-inverted contrast",
    },
    {
      text: `${RUNWAY} Big promises, small results.`,
      spanText: "Big promises, small results",
      needsClauses: true,
      note: "verbless mirrored pair — two halves of equal word count",
    },
  ],
  negatives: [
    {
      text: `${RUNWAY} The build passed.`,
      needsClauses: true,
      note: "short final sentence, but a plain statement: real verb, no rhetorical shape",
    },
    {
      text: `${RUNWAY} "A choice, not an accident".`,
      needsClauses: true,
      note: "the same aphorism quoted rather than written — a unit dominated by a quoted span is suppressed",
    },
    {
      text: "We shipped it. A choice, not an accident.",
      needsClauses: true,
      note: "the shape with no runway: the paragraph never spends two long sentences before landing",
    },
  ],
};

// Fixtures for discourse/trailing-tail — a sentence that finishes its point and then adds a comma
// and one more phrase. The rule is gated on the document RATE (see the rule header: the shape
// occurs 2.98 times per 1000 words in this repository's own hand-written prose), so a positive has
// to be a whole short document rather than a sentence. That is the fixture format working as
// intended: a rule whose claim is about a rate cannot be fixtured with an isolated example, and
// pretending otherwise would be testing something the rule does not assert.
//
// The negatives are the categories the narrowing excludes, each one a tail whose job is already
// visible from its first word, carried in a document long and dense enough that the rate gate is
// NOT what is keeping the rule quiet.

import type { RuleFixtures } from "./types.js";

// Padding with no comma in it, so a fixture controls its own tail count exactly.
const pad = (n: number): string => `${Array.from({ length: n }, (_, i) => `alpha${i}`).join(" ")}.`;

const TAIL_A = "The scheduler rewrite shipped a full release behind the roadmap, with a rule-based fallback parser.";
const TAIL_B = "Every downstream team replanned against a date that moved twice, for reasons nobody wrote down.";
const TAIL_C = "Hiring stayed frozen through the whole of the second quarter, against the advice of both leads.";
const TAIL_D = "The postmortem ran to nine pages and named four owners, per the template the org adopted.";

export const fixtures: RuleFixtures = {
  ruleId: "discourse/trailing-tail",
  positives: [
    {
      text: `${pad(300)} ${TAIL_A} ${TAIL_B} ${TAIL_C} ${TAIL_D}`,
      spanText: "The scheduler rewrite shipped a full release behind the roadmap, with a rule-based fallback parser.",
      profile: "rate",
      note: "four bare tails in ~340 words is 11.7 per 1000 — four times the rate of this repo's own prose. A rate claim: at level 1 the doubled floor silences it, which is the dial working rather than a regression.",
    },
  ],
  negatives: [
    {
      text: `${pad(300)} The parser produces a constituency parse, which is lowered to a grammatical IR. The rewrite slipped a whole quarter, because nobody had staffed the backlog. The scheduler rewrite shipped a full release late, the fallback parser was never used. Hiring stayed frozen for two quarters and cost the team its summer, and nobody wrote that down.`,
      note: "four trailing phrases at a rate well over the floor — a relative clause, a reason, a second clause, and coordination. The contrast-tail and -ing exclusions are pinned by this rule's own unit tests instead: as fixtures they would be other rules' positives, and the battery's cross-rule check would rightly fire on them.",
    },
    {
      text: `${pad(300)} ${TAIL_A} ${TAIL_B} ${TAIL_C}`,
      profile: "rate",
      note: "three bare tails: under the absolute floor, whatever the rate works out to",
    },
    {
      text: `${pad(1060)} ${TAIL_A} ${TAIL_B} ${TAIL_C} ${TAIL_D}`,
      profile: "rate",
      note: "the same four tails diluted to 3.6 per 1000 — near what deliberate human prose measures",
    },
    {
      text: `${TAIL_A} ${TAIL_B} ${TAIL_C} ${TAIL_D}`,
      profile: "rate",
      note: "a rate over 60 words is noise; the short-document guard is what holds here",
    },
  ],
};

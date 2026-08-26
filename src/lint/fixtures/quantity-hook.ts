// Fixtures for rules/quantity-hook.ts — "3 rules. And none you set." A number used as bait, then
// taken back before the reader has been told anything.
//
// Spans cover BOTH beats and stop at the last word of the second, not its full stop: unit spans
// come from document.ts's splitUnits, which excludes the terminal punctuation (see stub-doc's
// spanOf and how every other two-unit rule in this directory writes its spanText).
//
// The negatives are where the rule earns its keep, and each is kept out by a different one of its
// four tests: the quantity has to open the first beat, the first beat has to carry no finite verb,
// the second beat has to VOID rather than merely modify, and both beats have to be short enough to
// be beats rather than sentences.

import type { RuleFixtures } from "./types.js";

export const fixtures: RuleFixtures = {
  ruleId: "discourse/quantity-hook",
  positives: [
    {
      text: "3 rules. And none you set.",
      spanText: "3 rules. And none you set",
      needsClauses: true,
      note: "the specimen this rule was written for — and the one punchy-fragments misses, because the second beat's \"set\" reads as a verb and makes the unit unparseable rather than a fragment",
    },
    {
      text: "Six weeks of planning. Not one line shipped.",
      spanText: "Six weeks of planning. Not one line shipped",
      needsClauses: true,
      note: "a spelled cardinal opening a four-word noun phrase, voided by \"not\"",
    },
    {
      text: "A thousand dashboards. Nobody reading them.",
      spanText: "A thousand dashboards. Nobody reading them",
      needsClauses: true,
      note: "the article-plus-round-number form, and a second beat with a participle in it",
    },
    {
      text: "The rollout went fine everywhere else. Twelve engineers. Zero tests.",
      spanText: "Twelve engineers. Zero tests",
      nth: 1,
      needsClauses: true,
      note: "mid-document rather than opening, so it reports a step lower — the span still covers exactly the two beats and not the sentence before them",
    },
  ],
  negatives: [
    {
      text: "Twelve engineers work on the scheduler.",
      note: "one sentence with the number inside it, which is what putting a count in prose looks like",
    },
    {
      text: "Twelve engineers are idle. None of them mind.",
      note: "the first beat carries a finite verb, so it is a sentence and not a count beat — this is the pair that would fire if the rule keyed on the parse outcome instead",
    },
    {
      text: "Twelve engineers. Half of them remote.",
      note: "\"half\" modifies the count, it does not void it — a report, not a hook",
    },
    {
      text: "First rule. None you set.",
      note: "an ordinal enumerates rather than quantifies, so there is no count to take away",
    },
    {
      text: "Three tickets. Two were duplicates.",
      note: "the second beat is another count, not a negation — the disproportion variant this rule deliberately leaves alone (see its header on ingredient lists)",
    },
    {
      text: "He counted them twice. Sixteen, not fifteen.",
      note: "the quantity opens the SECOND unit and the negation is inside it — the shape reversed, which is ordinary writing",
    },
  ],
};

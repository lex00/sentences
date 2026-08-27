// Fixtures for rules/setup-turn.ts — "3 rules. And none you set." A bare noun phrase presented as
// a sentence, then taken away before the reader has been told anything about it.
//
// Spans cover BOTH beats and stop at the last word of the second, not its full stop: unit spans
// come from document.ts's splitUnits, which excludes the terminal punctuation (see stub-doc's
// spanOf and how every other two-unit rule in this directory writes its spanText).
//
// The negatives are where the rule earns its keep, and each is kept out by a different one of its
// four tests: the setup has to read as a noun phrase, it has to carry no finite verb of its own,
// the turn has to VOID rather than merely modify or negate a verb, and both beats have to be short
// enough to be beats rather than sentences.

import type { RuleFixtures } from "./types.js";

export const fixtures: RuleFixtures = {
  ruleId: "discourse/setup-turn",
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
      note: "the article-plus-round-number form, and a turn with a participle in it",
    },
    {
      text: "Endless meetings. No decisions.",
      spanText: "Endless meetings. No decisions",
      needsClauses: true,
      note: "no number anywhere — the form the first version of this rule (quantity-hook) missed, and the reason it was generalized",
    },
    {
      text: "A new framework. And nobody asked for it.",
      spanText: "A new framework. And nobody asked for it",
      needsClauses: true,
      note: "a plain noun-phrase setup, a leading conjunction on the turn, and a finite verb inside it",
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
      text: "The report is finished. Do not rely on it for the quarterly numbers.",
      note:
        "\"do not\" negates a VERB — the setup is still standing and nothing was taken away. Only " +
        "quantificational \"not\" voids (\"Not one line shipped\"), which is what keeps this rule " +
        "off ordinary imperative prose",
    },
    {
      text: "Twelve engineers work on the scheduler.",
      note: "one sentence with the number inside it, which is what putting a count in prose looks like",
    },
    {
      text: "Twelve engineers are idle. None of them mind.",
      note: "the setup carries a finite verb, so it is a sentence and not a setup — this is the pair that would fire if the rule keyed on the parse outcome instead",
    },
    {
      text: "Twelve engineers. Half of them remote.",
      note: "\"half\" modifies the setup, it does not void it — a report, not a hook",
    },
    {
      text: "Three tickets. Two were duplicates.",
      note: "the turn is another count, not a negation — the disproportion variant this rule deliberately leaves alone (see its header on ingredient lists)",
    },
    {
      text: "He counted them twice. Sixteen, not fifteen.",
      note: "the setup carries a finite verb (\"counted\"), which the -ed evidence catches where the auxiliary list cannot",
    },
  ],
};

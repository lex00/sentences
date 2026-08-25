// Fixtures for rules/reframe.ts (reframeRule) — mined from reframe.test.ts's own end-to-end
// (readDocument) and token-shape cases.
// Contracted copulas lower on the rule-based path since the #31 tagger fix, so the flagship
// contracted form is a positive here.
//
// #34 adds the temporal-absolute variant ("It was never X. It was always Y."), mined from the same
// test file's "It was never X. It was always Y." block. Three shapes, three arms:
//   two-sentence, plain adjective   -> the ordinary structural pair (isNegated now covers "never")
//   two-sentence, "about" PP        -> isAboutPair (isCopular's complement is null for a bare PP)
//   one sentence, comma-spliced     -> the comma-variant token-shape arm (the real parser collapses
//                                      the comma splice to a single clause, so there is no clause
//                                      pair to find structurally)

import type { RuleFixtures } from "./types.js";

export const fixtures: RuleFixtures = {
  ruleId: "reframe",
  positives: [
    {
      text: "This is not a rant. This is a diagnosis.",
      spanText: "not a rant. This is a diagnosis",
      needsClauses: true,
      note: "canonical two-sentence reframe, uncontracted, through the real parser",
    },
    {
      text: "The problem was not the code; it was your head.",
      spanText: "not the code; it was your head",
      needsClauses: true,
      note: "full NP answered by a back-referring pronoun, across a semicolon",
    },
    {
      text: "She stayed not because the pay was good, but because the work was hers.",
      spanText: "not because the pay was good, but because the work was hers.",
      note: "the because-variant: token shape alone, no parse needed at all",
    },
    {
      // Kept longer than "It's not bold. It's backwards." so it clears punchy-fragments'
      // SHORT_WORD_MAX(4) — that shorter form is ALSO a punchy run by that rule's documented
      // contract, which the cross-rule precision check can't tell apart from a false positive.
      text: "It's obviously not the bold plan for this year's big project. It's actually the safer plan for the team.",
      spanText: "not the bold plan for this year's big project. It's actually the safer plan for the team",
      needsClauses: true,
      note: "contracted copulas lower since the #31 tagger fix — the flagship form fires on the rule-based path",
    },
    {
      text: "It was never bold. It was always safe.",
      spanText: "never bold. It was always safe",
      needsClauses: true,
      note: "#34 temporal-absolute variant, uncontracted: isNegated now covers \"never\", caught by the ordinary structural pair path",
    },
    {
      text: "It was never about the money. It was always about control.",
      spanText: "never about the money. It was always about control",
      needsClauses: true,
      note: "#34 about-PP form: the real parser leaves complement null and hangs \"about X\" off the verb, so isAboutPair catches it",
    },
    {
      text: "It was never about the money, it was always about control.",
      spanText: "never about the money, it was always about control",
      needsClauses: true,
      note: "#34 the LinkedIn-classic shape, comma-spliced into one sentence: the real parser collapses this to one clause, so the comma-variant token-shape arm catches it",
    },
  ],
  negatives: [
    { text: "It is not ready yet. The build starts at nine.", needsClauses: true, note: "plain negation, nothing paired with it" },
    { text: "The sky is not blue. The grass is green.", needsClauses: true, note: "different subjects, neither pronominal" },
    { text: "This is a rant. This is a diagnosis.", needsClauses: true, note: "no negation at all" },
    { text: "It is not bold. It is not brave.", needsClauses: true, note: "two denials, no swap" },
    { text: "It was never finished.", needsClauses: true, note: "#34: a lone \"never\" clause with nothing adjacent to pair with" },
    { text: "She never lies. He always exaggerates.", needsClauses: true, note: "#34: different subjects, neither clause copular" },
    { text: "It was never easy, but we managed.", needsClauses: true, note: "#34: \"never\" paired with a non-copular affirmative clause, no \"always\"" },
  ],
};

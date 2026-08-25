// Fixtures for rules/reframe.ts (reframeRule) — mined from reframe.test.ts's own end-to-end
// (readDocument) and token-shape cases.
//
// KNOWN LIMIT (engine bug #31, not this rule's to fix, not depended on here): a contracted copula
// ("It's not bold.") does not lower on today's rule-based chunker — the unit comes back a fragment
// with no clauses, so nothing fires. reframe.test.ts pins this by hand
// ("contracted copulas are a fragment on this path today"); the contracted form below is fixtured
// as a negative-FOR-NOW on that basis, not assumed.

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
  ],
  negatives: [
    { text: "It is not ready yet. The build starts at nine.", needsClauses: true, note: "plain negation, nothing paired with it" },
    { text: "The sky is not blue. The grass is green.", needsClauses: true, note: "different subjects, neither pronominal" },
    { text: "This is a rant. This is a diagnosis.", needsClauses: true, note: "no negation at all" },
    { text: "It is not bold. It is not brave.", needsClauses: true, note: "two denials, no swap" },
    {
      // Longer than "It's not bold. It's backwards." on purpose, and for a reason worth recording:
      // that shorter form is ALSO a punchy-fragments run (2 consecutive <=4-word fragments) by that
      // rule's own contract — a genuine, documented overlap (see fragments.ts's file header and
      // fragments.test.ts's "a short reframe pair also earns a run finding" test), not a bug in
      // either rule, but one this fixture battery's cross-rule precision check cannot tell apart
      // from a real false positive. Keeping both fragments over punchy's SHORT_WORD_MAX(4) here
      // demonstrates the SAME #31 gap (still a fragment, still nothing for reframe to pair) without
      // tripping that unrelated collision.
      text: "It's obviously not the bold plan for this year's big project. It's actually the safer plan for the team.",
      needsClauses: true,
      note: "contracted copula fails to lower today (engine bug #31) — negative-for-now, will need retest once #31 lands",
    },
  ],
};

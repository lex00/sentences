// Fixtures for lexicons/delve-family.ts, via rules/lexical.ts's lexDelveFamilyRule. Cases mined
// from rules/lexical.test.ts (the rule's own worked examples): lemma inflection, word-boundary
// matching, and the posGate:"verb" entries ("leverage", "harness").

import type { RuleFixtures } from "./types.js";

export const fixtures: RuleFixtures = {
  ruleId: "lex-delve-family",
  positives: [
    {
      text: "We need to delve into this.",
      spanText: "delve",
      note: "the most infamous AI tell; carries its own severity override, fires even alone",
    },
    {
      text: "We should utilize this approach.",
      spanText: "utilize",
      note: "lemma match; below densityThreshold(2) with only 1 hit, so severity steps down — span still exact",
    },
    { text: "The API is robust.", spanText: "robust", note: "whole-word match" },
    {
      text: "We should leverage our funding.",
      spanText: "leverage",
      posOverrides: { leverage: "VBP" },
      note: "posGate:verb — fires once POS evidence says verb",
    },
  ],
  negatives: [
    { text: "The API's robustness improved this year.", note: "'robust' must not match inside 'robustness' (word boundary)" },
    { text: "We leverage our funding for growth.", note: "posGate:verb entry stays silent with no POS evidence at all (fails closed)" },
    {
      text: "The leverage was gone by noon.",
      posOverrides: { leverage: "NN" },
      note: "posGate:verb rejects a noun-tagged 'leverage'",
    },
    { text: "The dog chased the ball across the yard.", note: "clean prose, no lexicon words at all" },
  ],
};

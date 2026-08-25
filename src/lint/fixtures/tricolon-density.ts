// Fixtures for rules/tricolon.ts's registered id, "tricolon/density" (the LARGE_AT 4+/5+ item
// per-compound finding). The document-level sub-finding ("tricolon/document-density") is emitted
// under a different Finding.ruleId by the same TropeRule object (see tricolon.ts's file header —
// the engine's dedupe keys on a finding's own ruleId, so one module reporting under sub-ids is an
// intended shape) but is not itself a registered rule, so it has no fixture file of its own; it
// stays covered by tricolon.test.ts.
//
// KNOWN LIMIT: tricolon.ts's own test file notes the rule-based chunker "does not reliably build a
// genuine N-item Compound from raw comma-separated text (it merges conjuncts into one head instead
// of splitting them)" — confirmed here too: neither "apples, bananas, cherries, and dates" nor
// "apples, bananas, and cherries" produces a Compound through readDocument. Repeated bare "and"
// coordination DOES lower to a real Compound, so the positive below uses that shape instead.

import type { RuleFixtures } from "./types.js";

export const fixtures: RuleFixtures = {
  ruleId: "tricolon/density",
  positives: [
    {
      text: "It was quick and quiet and cheap and simple.",
      spanText: "It was quick and quiet and cheap and simple",
      needsClauses: true,
      note: "4-item compound via repeated bare 'and' coordination — degrades to the whole unit's span",
    },
  ],
  negatives: [
    {
      text: "It was quick and quiet.",
      needsClauses: true,
      note: "only two items — not a tricolon at all",
    },
    {
      text: "She bought apples, bananas, and cherries.",
      needsClauses: true,
      note: "comma-separated list — the chunker merges these into one head, never a real 3-item Compound",
    },
  ],
};

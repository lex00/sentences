// Fixtures for rules/fragments.ts's countdownRule — mined from fragments.test.ts.

import type { RuleFixtures } from "./types.js";

export const fixtures: RuleFixtures = {
  ruleId: "discourse/countdown",
  positives: [
    {
      text: "Not a bug. Not a feature. A fundamental design flaw.",
      spanText: "Not a bug. Not a feature. A fundamental design flaw",
      needsClauses: true,
      note: "2 negated fragments then a capping full clause — the tropes.fyi example",
    },
  ],
  negatives: [
    {
      text: "Not a bug. Everything else here reads normally and calmly.",
      needsClauses: true,
      note: "a single negated fragment is not a countdown",
    },
    {
      text: "Not a poorly designed feature request. Not an accidental oversight either.",
      needsClauses: true,
      note: "the negated run has no cap — document ends mid-count. Longer than 4 words per fragment on " +
        "purpose: a *short* (<=4-word) negated run is ALSO a punchy-fragments run by that rule's own " +
        "contract (see discourse/punchy-fragments's fixture and fragments.ts's file header), so a short " +
        "'no cap' example here would fail cross-rule precision for a reason that isn't a bug in either " +
        "rule — this fixture avoids that overlap by keeping the fragments outside punchy's short-word gate.",
    },
    {
      text: "The color was not red. It looked closer to orange instead.",
      needsClauses: true,
      note: "negation present, but this lowers to real clauses (not fragments) — never enters this rule's fragment-only signal at all",
    },
  ],
};

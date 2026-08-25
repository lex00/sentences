// Fixtures for rules/colon-reveal.ts ("claude/colon-reveal") — the setup-label colon and the
// appositive "…: one where …" reveal. Both positives are from the post that motivated #34's recall
// round, reworded off the real names.
//
// The negatives are the four suppressions the rule ships with, one each: markdown structure, the
// conventional-label allowlist, timestamps, and URLs. All run through makeDoc, which splits on ":"
// exactly as document.ts does — the rule reads the colon out of either builder's convention (see
// its file header).

import type { RuleFixtures } from "./types.js";

export const fixtures: RuleFixtures = {
  ruleId: "claude/colon-reveal",
  positives: [
    {
      text: "Priya's take: automate everything you safely can and bake governance in early.",
      spanText: "Priya's take",
      note: "the short-label arm — a nameplate on a sentence that could stand alone",
    },
    {
      text: "The pitch is for an engineering-first security model: one where security teams help build the guardrails.",
      spanText: "model: one where",
      note: "the appositive arm — the noun restated after the colon, at length",
    },
  ],
  negatives: [
    {
      text: "## Results:\n\nThe migration cut tail latency by half.",
      note: "a markdown heading label is document structure, not a rhetorical reveal",
    },
    {
      text: "Note: the migration runs twice on the first day.",
      note: "a conventional label from the allowlist — no reveal in it",
    },
    {
      text: "Standup is at 9:30 sharp every weekday morning.",
      note: "a timestamp colon, with a digit on both sides",
    },
    {
      text: "The setup guide lives here: https://example.com/guide for anyone who needs it.",
      note: "a URL colon — the scheme, and the '//' right after it, both say so",
    },
    {
      text: "- Timeout: thirty seconds by default\n- Retries: three attempts before failover",
      note: "list-item labels are structure too",
    },
  ],
};

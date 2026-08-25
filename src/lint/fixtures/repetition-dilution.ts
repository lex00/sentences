// Fixtures for rules/repetition.ts's dilutionRule — mined from repetition.test.ts. The finding's
// span is always the whole document ({start:0, end:text.length}); that's expressed here simply by
// setting spanText to the fixture's entire text — no format extension needed for a "whole document"
// span, since the exact-substring match already covers the [0, length) case.

import type { RuleFixtures } from "./types.js";

const dilutedDoc = [
  "The team quietly finished the project.",
  "The team quietly finished the report.",
  "The team quietly finished the review.",
  "The team quietly finished the audit.",
].join(" ");

// Sentence openers are varied on purpose (see this file's cross-rule note in the retrofit report)
// so this negative doesn't also read as anaphora's repeated-opening trope.
const TECH_DOC = [
  "The parser reads the source text carefully before anything else happens.",
  "Next, a tree gets built from every token it recognizes.",
  "Each node in that tree gets walked during a later pass.",
  "Any errors the parser finds are reported along the way.",
  "Finally, formatted output gets written to disk.",
  "The lexer splits the raw characters into those same tokens first.",
  "The checker validates every declared type against its recorded usage.",
  "The formatter rewrites the resulting tree back into readable indented source.",
].join(" ");

export const fixtures: RuleFixtures = {
  ruleId: "repetition/dilution",
  positives: [
    {
      text: dilutedDoc,
      spanText: dilutedDoc,
      note: "3-word runs mostly restate an earlier one ('the team quietly finished' x4) — span is the whole document",
    },
  ],
  negatives: [
    { text: TECH_DOC, note: "varied phrasing repeating a term, not a run, stays clean" },
    { text: "The dog chased the ball across the yard today.", note: "too short for the ratio to mean anything" },
  ],
};

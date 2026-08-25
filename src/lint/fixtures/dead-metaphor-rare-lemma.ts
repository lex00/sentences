// Fixtures for rules/dead-metaphor.ts (deadMetaphorRule) — mined from dead-metaphor.test.ts.

import type { RuleFixtures } from "./types.js";

// Each sentence contributes "Wall" plus three unique, made-up tokens, so "wall" is the only lemma
// that ever recurs — isolates the "one rare lemma far above baseline" signal from any other source
// of repetition. 25 repeats -> 100 content words, minCount = max(10, ceil(100*0.04)) = 10; 25 >= 15.
const wallDoc = Array.from({ length: 25 }, (_, i) => `Wall marker${i} tag${i} note${i}.`).join(" ");

// The must-not-fire case from issue #22: a tight technical doc that necessarily repeats a domain
// term ("parser") a few times, extended so it clears MIN_DOC_CONTENT_WORDS. Sentence openers are
// varied on purpose (see the retrofit's cross-rule note in fixture-battery.test.ts's report) so
// this negative doesn't also read as anaphora's repeated-opening trope.
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
  ruleId: "dead-metaphor/rare-lemma",
  positives: [
    {
      text: wallDoc,
      spanText: "Wall",
      note: "'wall' recurs 25 times against a floor of 10 for a document this size — medium band",
    },
  ],
  negatives: [
    { text: TECH_DOC, note: "ordinary domain-term repetition ('parser', 5x) across distinct sentences stays under the absolute floor" },
  ],
};

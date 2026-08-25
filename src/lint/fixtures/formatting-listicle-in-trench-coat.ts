// Fixtures for rules/formatting.ts's listicleInTrenchCoatRule — mined from formatting.test.ts.

import type { RuleFixtures } from "./types.js";

const threeOrdinals = [
  "The first wall is the absence of a free, scoped API for this exact case.",
  "",
  "The second wall is the lack of delegated access across teams.",
  "",
  "The third wall is the absence of scoped permissions entirely.",
].join("\n");

const twoOrdinalsPlusOther = [
  "The first wall is the absence of a free API.",
  "",
  "The second wall is the lack of delegated access.",
  "",
  "Something else entirely follows here.",
].join("\n");

const interrupted = [
  "The first point stands on its own here today.",
  "",
  "Meanwhile something unrelated happens in between paragraphs.",
  "",
  "The second point follows after the interruption above.",
  "",
  "The third point closes out the discussion nicely.",
].join("\n");

export const fixtures: RuleFixtures = {
  ruleId: "formatting/listicle-in-trench-coat",
  positives: [
    { text: threeOrdinals, spanText: threeOrdinals, note: "3 consecutive ordinal-opening paragraphs, whole run is the span" },
  ],
  negatives: [
    { text: twoOrdinalsPlusOther, note: "only 2 consecutive ordinal paragraphs before a non-ordinal one" },
    { text: interrupted, note: "a non-ordinal paragraph splits the run so neither side reaches 3" },
  ],
};

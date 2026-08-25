// Fixtures for rules/excess-vocabulary.ts (issue #34's consolidation pass). Span-matching only —
// see rules/excess-vocabulary.test.ts for the severity-band assertions (medium pinned, low pinned,
// candidate reached via the standard tier's density step-down), the same split
// claude-discourse-markers.ts's fixtures/test-file pair uses.
import type { RuleFixtures } from "./types.js";

export const fixtures: RuleFixtures = {
  ruleId: "excess-vocabulary",
  positives: [
    {
      text: "The report keeps showcasing the same three metrics every quarter.",
      spanText: "showcasing",
      note: "medium band (paper's own >=8x example list)",
    },
    {
      text: "This was a pivotal moment for the whole team.",
      spanText: "pivotal",
      note: "low band, pinned severity regardless of document density",
    },
    {
      text: "This step is crucial for the migration to succeed.",
      spanText: "crucial",
      note: "candidate band — no severity override, so a lone hit steps down from the lexicon's low default",
    },
  ],
  negatives: [
    {
      text: "The team migrated the database over the weekend without incident.",
      note: "clean prose, none of this lexicon's words appear",
    },
    {
      text: "This deal is nothing special, nothing remarkable at all.",
      note: "\"remarkable\" is a genuine excess-vocabulary word but deliberately excluded — see the lexicon file header (collides with formatting-em-dash-density.ts's negative fixture)",
    },
    {
      text: "The insight from the retro was buried in the notes.",
      note: "\"insight\" (singular) isn't listed — only \"insights\" (plural) is, and this rule matches exact tokens",
    },
  ],
};

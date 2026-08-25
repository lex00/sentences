// Fixtures for rules/serves-as.ts (servesAsDodgeRule) — mined from serves-as.test.ts's "parser gap"
// describe block.
//
// KNOWN LIMIT (bug #33, not depended on here): the PHRASAL frame ("serves as" / "stands as") cannot
// fire through today's readDocument — the rule-based chunker drops "as X" entirely after serve/stand
// (confirmed by hand in serves-as.ts's PARSER GAP note and pinned by serves-as.test.ts). The BARE
// frame (mark/represent as a plain transitive verb) DOES fire through readDocument today — plain
// transitive objects parse fine. This file fixtures what fires (bare) and leaves the phrasal frame
// to serves-as.test.ts's hand-built Clause fixtures; the phrasal examples are fixtured here as
// negatives-for-now, confirmed (not assumed) by serves-as.test.ts's own "cannot fire" pin.

import type { RuleFixtures } from "./types.js";

export const fixtures: RuleFixtures = {
  ruleId: "serves-as-dodge",
  positives: [
    {
      text: "This documentary represents a turning point in independent filmmaking.",
      spanText: "represents",
      needsClauses: true,
      note: "bare frame (transitive 'represent') — the parser handles this fine today",
    },
  ],
  negatives: [
    {
      text: "The marks on the wall are ugly.",
      needsClauses: true,
      note: "'marks' is the subject noun here, never the verb",
    },
    {
      text: "The district is represented by the senator.",
      needsClauses: true,
      note: "passive voice leaves clause.complement null — the bare frame's own requirement excludes it",
    },
    {
      text: "The building serves as a reminder of the city's heritage.",
      needsClauses: true,
      note: "phrasal frame — parser gap (bug #33): the chunker drops \"as X\" after serve/stand entirely, so this never fires end-to-end today",
    },
  ],
};

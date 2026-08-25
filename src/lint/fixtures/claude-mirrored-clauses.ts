// Fixtures for rules/mirrored-clauses.ts (mirroredClausesRule). All of them need real clauses — the
// whole rule is a shape in the Clause IR, and makeDoc supplies none.
//
// The three negatives are the rule's seams with its neighbours, one each: reframe.ts owns negated
// pairs, anaphora.ts owns same-subject repeats, and ordinary singular-subject prose owns everything
// else.

import type { RuleFixtures } from "./types.js";

export const fixtures: RuleFixtures = {
  ruleId: "claude/mirrored-clauses",
  positives: [
    {
      text: "Products impress people; platforms empower them.",
      spanText: "Products impress people; platforms empower them",
      needsClauses: true,
      note: "the flagship: two transitive frames across a semicolon, contrasting plural subjects, equal length",
    },
    {
      text: "Engineers write code. Managers write memos.",
      spanText: "Engineers write code. Managers write memos",
      needsClauses: true,
      note: "same mirror across a sentence boundary, with the verb echoed rather than swapped",
    },
    {
      text: "Products are engines. Platforms are vehicles.",
      spanText: "Products are engines. Platforms are vehicles",
      needsClauses: true,
      note: "the copular variant — both sides a be-form with a predicate complement",
    },
  ],
  negatives: [
    {
      text: "Products are not tools. Platforms are worlds.",
      needsClauses: true,
      note: "a denial answered by its replacement — reframe.ts's pattern, not this one; both clauses must be affirmative",
    },
    {
      text: "Platforms empower people. Platforms create worlds.",
      needsClauses: true,
      note: "same subject head repeated — anaphora.ts's signal; a mirror needs two DIFFERENT subjects",
    },
    {
      text: "The dog chased the ball. A cat slept on the warm windowsill.",
      needsClauses: true,
      note: "two adjacent transitive-ish sentences of ordinary prose — singular subjects never qualify",
    },
    {
      text: "Birds gathered near a feeder by the fence. Markets closed early ahead of the holiday weekend.",
      needsClauses: true,
      note: "plural subjects and matching length, but the chunker only calls these transitive by folding PPs into the object — the bare-frame test is what keeps them out",
    },
  ],
};

// IR fixtures. Phase 1 also carried a throwaway Scene placer here; Phase 3's layout() engine
// superseded it, so only the semantic IR remains. Scenes come from layout(ir, metrics).

import type { Clause } from "./ir.js";

// "The small dog barked loudly." (intransitive)
export const irA: Clause = {
  subject: {
    head: { text: "dog" },
    modifiers: [
      { kind: "word", value: { text: "the" } },
      { kind: "word", value: { text: "small" } },
    ],
  },
  verb: { head: { text: "barked" }, modifiers: [{ kind: "word", value: { text: "loudly" } }] },
  complement: null,
};

// "The dog barked softly." — drops "small" (exit), retints the adverb (update), reflows the rail.
export const irB: Clause = {
  subject: { head: { text: "dog" }, modifiers: [{ kind: "word", value: { text: "the" } }] },
  verb: { head: { text: "barked" }, modifiers: [{ kind: "word", value: { text: "softly" } }] },
  complement: null,
};

// "Dogs and cats chase mice." — compound subject (fork), transitive.
export const irCompound: Clause = {
  subject: {
    items: [
      { head: { text: "dogs" }, modifiers: [] },
      { head: { text: "cats" }, modifiers: [] },
    ],
    conjunction: { text: "and" },
  },
  verb: { head: { text: "chase" }, modifiers: [] },
  complement: { kind: "directObject", value: { head: { text: "mice" }, modifiers: [] } },
};

// "The dog slept because dogs barked." — subordinate (adverbial) clause on the verb.
export const irSubclause: Clause = {
  subject: { head: { text: "dog" }, modifiers: [{ kind: "word", value: { text: "the" } }] },
  verb: {
    head: { text: "slept" },
    modifiers: [
      {
        kind: "clause",
        connector: { text: "because" },
        value: {
          subject: { head: { text: "dogs" }, modifiers: [] },
          verb: { head: { text: "barked" }, modifiers: [] },
          complement: null,
        },
      },
    ],
  },
  complement: null,
};

// The sequence the Animator cycles through (each lowered through layout()).
export const cycle: readonly Clause[] = [irA, irB, irCompound, irSubclause];

// The morph pair the Animator toggles between (after lowering through layout()).
export const morphPair: readonly [Clause, Clause] = [irA, irB];

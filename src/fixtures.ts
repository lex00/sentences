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

// The morph pair the Animator toggles between (after lowering through layout()).
export const morphPair: readonly [Clause, Clause] = [irA, irB];

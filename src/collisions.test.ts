import { describe, it, expect, beforeAll } from "vitest";
import { lowerSentence } from "./lower.js";
import { layout, type TextMetrics } from "./layout.js";
import { collisions } from "./collisions.js";
import { loadFontMetrics } from "./metrics-font.js";
import { defaultLayoutStyle as S } from "./theme.js";
import corpus from "./parser/__fixtures__/corpus.json";

// Round-trip overlap sweep: each corpus sentence (real benepar parse) -> lower -> layout (with the
// pinned-font metrics the browser renders with) -> assert no two word labels overlap. Sentences
// lower() can't yet consume (benepar questions / relative clauses) are tracked as a known set so
// the suite stays green AND flags regressions either way.

// lower() doesn't yet handle these benepar structures (SQ/SBARQ questions, SBAR relative clauses
// with a gapped subject). The neural path falls back to rule-based for them. TODO: extend lower().
const KNOWN_LOWERING_GAPS = [
  "It won't be the carbon dioxide that kills us.",
  "Who chased the cat?",
  "Is the sky blue?",
  "The dog that barked ran away.",
].sort();

let metrics: TextMetrics;
beforeAll(() => {
  metrics = loadFontMetrics("node_modules/@fontsource/tinos/files/tinos-latin-400-normal.woff");
});

describe("round-trip overlap sweep", () => {
  const overlaps: string[] = [];
  const unsupported: string[] = [];

  it("computes the sweep", () => {
    for (const { sentence, ptb } of corpus as Array<{ sentence: string; ptb: string }>) {
      let scene;
      try {
        scene = layout(lowerSentence(ptb), metrics, S);
      } catch {
        unsupported.push(sentence);
        continue;
      }
      const cols = collisions(scene, metrics, S.em);
      if (cols.length) overlaps.push(`${sentence} — ${cols.map((c) => `"${c.a}"×"${c.b}"(${c.overlap}px)`).join(", ")}`);
    }
    expect(overlaps, `label overlaps:\n  ${overlaps.join("\n  ")}`).toEqual([]);
    expect(unsupported.sort(), "lowering-gap set changed").toEqual(KNOWN_LOWERING_GAPS);
  });
});

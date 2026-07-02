import { describe, it, expect } from "vitest";
import { ckyDecode, ckyKBest, ckyKBestScored, treeToString, type ParserVocab } from "./cky.js";
import vocab from "./__fixtures__/vocab.json";
import fixtures from "./__fixtures__/fixtures.json";

// Each fixture has the model's span scores + predicted tag ids for a sentence, plus the tree
// benepar's real (TreeCRF) decoder produced. The TS CKY must reproduce that tree exactly —
// validating the port against the Python reference before ORT-Web wiring.
type Fixture = { words: string[]; spanScores: number[][][]; tagIds: number[]; tree: string };

describe("CKY decoder matches benepar reference", () => {
  for (const fx of fixtures as Fixture[]) {
    it(`decodes "${fx.words.join(" ")}"`, () => {
      const tree = ckyDecode(fx.spanScores, fx.tagIds, fx.words, vocab as ParserVocab);
      expect(treeToString(tree)).toBe(fx.tree);
    });
  }
});

describe("CKY k-best", () => {
  for (const fx of fixtures as Fixture[]) {
    it(`k=1 reproduces the 1-best for "${fx.words.join(" ")}"`, () => {
      const best = ckyKBest(fx.spanScores, fx.tagIds, fx.words, vocab as ParserVocab, 1);
      expect(best).toHaveLength(1);
      expect(treeToString(best[0]!)).toBe(fx.tree);
    });

    it(`k=5 leads with the 1-best and returns distinct trees for "${fx.words.join(" ")}"`, () => {
      const kb = ckyKBest(fx.spanScores, fx.tagIds, fx.words, vocab as ParserVocab, 5);
      expect(kb.length).toBeGreaterThanOrEqual(1);
      expect(kb.length).toBeLessThanOrEqual(5);
      expect(treeToString(kb[0]!)).toBe(fx.tree); // top of k-best == the 1-best
      const strs = kb.map(treeToString);
      expect(new Set(strs).size).toBe(strs.length); // no duplicate derivations
    });

    it(`scores are descending with a zero-gap leader for "${fx.words.join(" ")}"`, () => {
      const scored = ckyKBestScored(fx.spanScores, fx.tagIds, fx.words, vocab as ParserVocab, 5);
      expect(treeToString(scored[0]!.tree)).toBe(fx.tree);
      for (let i = 1; i < scored.length; i++) expect(scored[i]!.score).toBeLessThanOrEqual(scored[i - 1]!.score);
    });

    it(`these unambiguous fixtures collapse to one parse under the near-tie margin for "${fx.words.join(" ")}"`, () => {
      // Degenerate label-drop alternatives sit ~1.9+ below the best, so a 1.2-logit margin prunes them.
      const scored = ckyKBestScored(fx.spanScores, fx.tagIds, fx.words, vocab as ParserVocab, 5);
      const best = scored[0]!.score;
      const kept = scored.filter((r) => best - r.score <= 1.2);
      expect(kept).toHaveLength(1);
    });
  }
});

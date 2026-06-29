import { describe, it, expect } from "vitest";
import { ckyDecode, treeToString, type ParserVocab } from "./cky.js";
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

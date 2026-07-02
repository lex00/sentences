import { describe, it, expect } from "vitest";
import { ckyDecode, ckyKBest, treeToString } from "./cky.js";
import vocab from "./__fixtures__/vocab.json";
import fixtures from "./__fixtures__/fixtures.json";
describe("CKY decoder matches benepar reference", () => {
    for (const fx of fixtures) {
        it(`decodes "${fx.words.join(" ")}"`, () => {
            const tree = ckyDecode(fx.spanScores, fx.tagIds, fx.words, vocab);
            expect(treeToString(tree)).toBe(fx.tree);
        });
    }
});
describe("CKY k-best", () => {
    for (const fx of fixtures) {
        it(`k=1 reproduces the 1-best for "${fx.words.join(" ")}"`, () => {
            const best = ckyKBest(fx.spanScores, fx.tagIds, fx.words, vocab, 1);
            expect(best).toHaveLength(1);
            expect(treeToString(best[0])).toBe(fx.tree);
        });
        it(`k=5 leads with the 1-best and returns distinct trees for "${fx.words.join(" ")}"`, () => {
            const kb = ckyKBest(fx.spanScores, fx.tagIds, fx.words, vocab, 5);
            expect(kb.length).toBeGreaterThanOrEqual(1);
            expect(kb.length).toBeLessThanOrEqual(5);
            expect(treeToString(kb[0])).toBe(fx.tree); // top of k-best == the 1-best
            const strs = kb.map(treeToString);
            expect(new Set(strs).size).toBe(strs.length); // no duplicate derivations
        });
    }
});

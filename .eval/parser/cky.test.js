import { describe, it, expect } from "vitest";
import { ckyDecode, treeToString } from "./cky.js";
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

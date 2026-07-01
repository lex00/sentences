import { describe, it, expect, beforeAll } from "vitest";
import { lowerSentence } from "./lower.js";
import { layout } from "./layout.js";
import { collisions } from "./collisions.js";
import { loadFontMetrics } from "./metrics-font.js";
import { defaultLayoutStyle as S } from "./theme.js";
import corpus from "./parser/__fixtures__/corpus.json";
// Round-trip overlap sweep: each corpus sentence (real benepar parse) -> lower -> layout (with the
// pinned-font metrics the browser renders with) -> assert no two word labels overlap. Sentences
// lower() can't yet consume (benepar questions / relative clauses) are tracked as a known set so
// the suite stays green AND flags regressions either way.
// lower() now handles benepar's questions (SQ/SBARQ) and relative clauses, so the whole corpus
// should lower. Any sentence here is a NEW lowering gap to fix.
const KNOWN_LOWERING_GAPS = [];
let metrics;
beforeAll(() => {
    metrics = loadFontMetrics("node_modules/@fontsource/tinos/files/tinos-latin-400-normal.woff");
});
describe("round-trip overlap sweep", () => {
    const overlaps = [];
    const unsupported = [];
    it("computes the sweep", () => {
        for (const { sentence, ptb } of corpus) {
            let scene;
            try {
                scene = layout(lowerSentence(ptb), metrics, S);
            }
            catch {
                unsupported.push(sentence);
                continue;
            }
            const cols = collisions(scene, metrics, S.em);
            if (cols.length)
                overlaps.push(`${sentence} — ${cols.map((c) => `"${c.a}"×"${c.b}"(${c.overlap}px)`).join(", ")}`);
        }
        expect(overlaps, `label overlaps:\n  ${overlaps.join("\n  ")}`).toEqual([]);
        expect(unsupported.sort(), "lowering-gap set changed").toEqual(KNOWN_LOWERING_GAPS);
    });
});

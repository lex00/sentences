import { describe, it, expect } from "vitest";
import { buildDocAnalysis } from "./build-doc.js";
import { spanOf } from "./stub-doc.js";
import {
  applyCut, budget, checkCut, coveredWords, isBalanced, isRestrictive, locate,
  offeredAt, reduceDocument, scanUnit, DEFAULT_REDUCTION_LEVEL, isReductionLevel,
} from "./reduction.js";
import type { ReductionCandidate } from "./reduction.js";

const scan = (text: string) => {
  const doc = buildDocAnalysis(text);
  const unit = doc.units[0]!;
  return { unit, clause: (unit.clauses ?? [])[0], ...scanUnit(text, unit) };
};
const texts = (text: string) => scan(text).candidates.map((c) => c.text);

const PARTICIPLE = "The station opened in 1994, highlighting its importance.";
const STACKED = "The tiny red dog barked loudly at the mailman in the yard.";

describe("what the diagram offers", () => {
  it("offers a trailing participial phrase", () => {
    expect(texts(PARTICIPLE)).toContain("highlighting its importance");
  });

  it("offers a prepositional phrase hanging off the baseline", () => {
    expect(texts(PARTICIPLE)).toContain("in 1994");
  });

  it("offers a nested modifier deeper than the one containing it", () => {
    const cs = scan(STACKED).candidates;
    const outer = cs.find((c) => c.text === "at the mailman in the yard")!;
    const inner = cs.find((c) => c.text === "in the yard")!;
    expect(inner.depth).toBeGreaterThan(outer.depth);
  });

  it("ranks deepest first", () => {
    const depths = scan(STACKED).candidates.map((c) => c.depth);
    expect(depths).toEqual([...depths].sort((a, b) => b - a));
  });

  it("never offers the baseline", () => {
    for (const t of [PARTICIPLE, STACKED]) {
      for (const word of ["station", "opened", "dog", "barked"]) {
        expect(texts(t)).not.toContain(word);
      }
    }
  });

  it("does not offer an article, which is a typo rather than a reduction", () => {
    expect(texts(STACKED)).not.toContain("The");
    expect(texts(STACKED)).not.toContain("the");
  });

  it("does not offer a single word — that is the lexical tier's business", () => {
    expect(scan(STACKED).candidates.every((c) => c.words >= 2)).toBe(true);
  });
});

describe("locate", () => {
  const words = buildDocAnalysis(STACKED).units[0]!.words;

  it("finds a run regardless of the order the IR holds it in", () => {
    // A Nominal is { head, modifiers }, so the tree yields "mailman" before "the".
    const span = locate(words, [{ text: "mailman" }, { text: "the" }]);
    expect(span && STACKED.slice(span.start, span.end)).toBe("the mailman");
  });

  it("returns null rather than guess when a run appears twice", () => {
    const twice = buildDocAnalysis("A dog in the yard and a cat in the yard.").units[0]!.words;
    expect(locate(twice, [{ text: "in" }, { text: "the" }, { text: "yard" }])).toBeNull();
  });

  it("returns null when the words are not there at all", () => {
    expect(locate(words, [{ text: "nonexistent" }, { text: "phrase" }])).toBeNull();
  });
});

describe("the safety check", () => {
  it("accepts a cut that leaves the baseline alone", () => {
    const { unit, clause } = scan(PARTICIPLE);
    const span = spanOf(PARTICIPLE, "highlighting its importance");
    const v = checkCut(unit.unit, clause!, span, unit.span.start);
    expect(v.safe).toBe(true);
    expect(v.safe && v.reduced).toBe("The station opened in 1994");
  });

  it("refuses a cut that removes the predicate", () => {
    const { unit, clause } = scan(PARTICIPLE);
    const v = checkCut(unit.unit, clause!, spanOf(PARTICIPLE, "opened"), unit.span.start);
    expect(v.safe).toBe(false);
    expect(v.safe === false && v.reason).toContain("does not parse");
  });

  it("refuses a cut whose span is outside its unit", () => {
    const { unit, clause } = scan(PARTICIPLE);
    const v = checkCut(unit.unit, clause!, { start: 9000, end: 9010 }, unit.span.start);
    expect(v.safe).toBe(false);
  });

  it("closes the seam a cut opens, so no comma is left stranded", () => {
    expect(applyCut("The station opened, highlighting it.", spanOf("The station opened, highlighting it.", "highlighting it")))
      .toBe("The station opened.");
  });

  it("leaves only the author's own words behind", () => {
    const out = applyCut(PARTICIPLE, spanOf(PARTICIPLE, "in 1994"));
    for (const w of out.split(/\s+/)) expect(PARTICIPLE).toContain(w.replace(/[.,]/g, ""));
  });
});

describe("balance and restrictiveness", () => {
  it("rejects a span holding half a bracket pair", () => {
    expect(isBalanced("of the pipeline (layout")).toBe(false);
    expect(isBalanced("of the pipeline (layout)")).toBe(true);
    expect(isBalanced("a quoted \"thing\"")).toBe(true);
    expect(isBalanced("a quoted \"thing")).toBe(false);
  });

  it("treats a modifier with no comma before it as restrictive", () => {
    const t = "The parser that runs client-side produces a parse.";
    expect(isRestrictive(t, spanOf(t, "that runs client-side"))).toBe(true);
  });

  it("treats a comma-set-off modifier as non-restrictive", () => {
    const t = "The parser, which runs client-side, produces a parse.";
    expect(isRestrictive(t, spanOf(t, "which runs client-side"))).toBe(false);
  });
});

describe("the dial", () => {
  const cand = (band: ReductionCandidate["band"], depth: number): ReductionCandidate =>
    ({ span: { start: 0, end: 1 }, band, depth, words: 2, text: "x", kind: "prep" });

  it("defaults to 2 and knows its own levels", () => {
    expect(DEFAULT_REDUCTION_LEVEL).toBe(2);
    for (const n of [1, 2, 3]) expect(isReductionLevel(n)).toBe(true);
    for (const n of [0, 4, "2", null]) expect(isReductionLevel(n)).toBe(false);
  });

  it("offers unconnected and parenthetical material at every level", () => {
    for (const level of [1, 2, 3] as const) {
      expect(offeredAt(cand("unconnected", 0), level)).toBe(true);
      expect(offeredAt(cand("parenthetical", 0), level)).toBe(true);
    }
  });

  it("offers no modifiers at 1, depth>=2 at 2, and any adjunct at 3", () => {
    expect(offeredAt(cand("modifier", 3), 1)).toBe(false);
    expect(offeredAt(cand("modifier", 1), 2)).toBe(false);
    expect(offeredAt(cand("modifier", 2), 2)).toBe(true);
    expect(offeredAt(cand("modifier", 1), 3)).toBe(true);
  });

  it("is monotone: a higher level never withdraws a candidate", () => {
    const doc = buildDocAnalysis(STACKED);
    const at = (l: 1 | 2 | 3) => new Set(reduceDocument(STACKED, doc.units, l).candidates.map((c) => c.text));
    for (const t of at(1)) expect(at(2).has(t)).toBe(true);
    for (const t of at(2)) expect(at(3).has(t)).toBe(true);
  });
});

describe("reduceDocument", () => {
  it("every reported candidate is a safe cut", () => {
    const doc = buildDocAnalysis(STACKED);
    const r = reduceDocument(STACKED, doc.units, 3);
    expect(r.candidates.length).toBeGreaterThan(0);
    for (const c of r.candidates) {
      const unit = doc.units.find((u) => c.span.start >= u.span.start && c.span.end <= u.span.end)!;
      expect(checkCut(unit.unit, (unit.clauses ?? [])[0]!, c.span, unit.span.start).safe).toBe(true);
    }
  });

  it("reports nothing on a document with no clauses", () => {
    const r = reduceDocument("", buildDocAnalysis("").units, 3);
    expect(r.candidates).toEqual([]);
    expect(r.words).toBe(0);
  });

  it("counts the words it would remove", () => {
    const doc = buildDocAnalysis(STACKED);
    const r = reduceDocument(STACKED, doc.units, 3);
    expect(r.words).toBe(r.candidates.reduce((n, c) => n + c.words, 0));
  });
});

describe("budget", () => {
  it("takes deepest-first and never two overlapping cuts", () => {
    const doc = buildDocAnalysis(STACKED);
    const r = reduceDocument(STACKED, doc.units, 3);
    const b = budget(r, 12, 6);
    for (const a of b.taken) {
      for (const c of b.taken) {
        if (a === c) continue;
        expect(a.span.start < c.span.end && c.span.start < a.span.end).toBe(false);
      }
    }
  });

  it("says so when it cannot reach the target without the baseline", () => {
    const doc = buildDocAnalysis(STACKED);
    const b = budget(reduceDocument(STACKED, doc.units, 3), 12, 1);
    expect(b.reached).toBe(false);
    expect(b.words).toBeGreaterThan(1);
  });

  it("stops as soon as the target is met", () => {
    const doc = buildDocAnalysis(STACKED);
    const b = budget(reduceDocument(STACKED, doc.units, 3), 12, 12);
    expect(b.taken).toEqual([]);
  });
});

describe("coveredWords", () => {
  const T = "The tiny red dog barked loudly at the mailman in the yard.";

  it("counts a nested candidate once, not twice", () => {
    const r = reduceDocument(T, buildDocAnalysis(T).units, 3);
    const summed = r.candidates.reduce((n, c) => n + c.words, 0);
    const covered = coveredWords(T, r.candidates);
    expect(covered).toBeLessThan(summed); // "in the yard" sits inside "at the mailman in the yard"
    expect(covered).toBe(6);
  });

  it("is zero for no candidates", () => {
    expect(coveredWords(T, [])).toBe(0);
  });

  it("never claims to remove more words than the text has", () => {
    const r = reduceDocument(T, buildDocAnalysis(T).units, 3);
    expect(coveredWords(T, r.candidates)).toBeLessThan((T.match(/[\p{L}\p{N}]+/gu) ?? []).length);
  });
});

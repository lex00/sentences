import { describe, it, expect } from "vitest";
import { runRules } from "../engine.js";
import { buildDocAnalysis } from "../build-doc.js";
import { bareTail, trailingTailRule } from "./trailing-tail.js";
import type { Strictness } from "../strictness.js";

const run = (text: string, strictness?: Strictness) =>
  runRules([trailingTailRule], buildDocAnalysis(text), strictness).findings;

// Filler that carries no comma of its own, so a test controls the tail count exactly.
const filler = (n: number): string =>
  `${Array.from({ length: n }, (_, i) => `alpha${i}`).join(" ")}.`;

const TAIL = "The scheduler rewrite shipped a full release behind the roadmap, with a rule-based fallback parser.";

// 4 tails in ~340 words: over MIN_WORDS, over MIN_TAILS, and 11.7 per 1000 — over the rate floor.
const FOUR = `${filler(300)} ${TAIL} ${TAIL} ${TAIL} ${TAIL}`;

describe("bareTail", () => {
  it("accepts a bare prepositional tail", () => {
    expect(bareTail("The scheduler rewrite shipped a full release behind the roadmap, with a rule-based fallback parser"))
      .toBe("with a rule-based fallback parser");
  });

  it("rejects coordination — the tail is the last item of a list", () => {
    expect(bareTail("It covers adjective complements, causative small clauses, and absolute phrases")).toBeNull();
  });

  it("rejects a relative clause, which says what it modifies", () => {
    expect(bareTail("The parser produces a constituency parse, which is lowered to a grammatical IR")).toBeNull();
  });

  it("rejects a subordinator — the tail is a reason", () => {
    expect(bareTail("The rewrite slipped a whole quarter, because nobody had staffed the backlog")).toBeNull();
  });

  it("rejects a contrast tail, which rules/contrast-tail.ts owns", () => {
    expect(bareTail("Bake governance into the design phase of the work, not the end of the pipeline")).toBeNull();
  });

  it("rejects an -ing participle, which rules/ing-tackon.ts owns", () => {
    expect(bareTail("The station opened to the public in the spring of 1994, highlighting its importance")).toBeNull();
  });

  it("rejects a tail carrying its own predicate — that is a clause", () => {
    expect(bareTail("The scheduler rewrite shipped a full release late, the fallback parser was never used")).toBeNull();
  });

  it("rejects a tail that is too short, too long, or hung off too short a head", () => {
    expect(bareTail("The scheduler rewrite shipped a release behind, in March")).toBeNull(); // 2 words
    expect(bareTail("Short head, with a rule-based fallback parser bolted on")).toBeNull(); // head < 8
  });

  it("ignores a comma inside parentheses and finds the real split", () => {
    // The last comma sits in the citation; taking it would make the tail "2000)".
    expect(bareTail("The result held across every single run we measured, per the memo (TCS 248, 2000)"))
      .toBe("per the memo (TCS 248, 2000)");
  });

  it("is not fooled into a tail that lives entirely inside an aside", () => {
    expect(bareTail("The whole measurement ran across six documentation files (5040 words, pooled)")).toBeNull();
  });

  it("returns null when there is no comma at all", () => {
    expect(bareTail("The scheduler rewrite shipped a full release behind the roadmap")).toBeNull();
  });
});

describe("discourse/trailing-tail", () => {
  it("fires on every tail once the document rate clears the floor", () => {
    const findings = run(FOUR);
    expect(findings).toHaveLength(4);
    expect(findings[0]!.ruleId).toBe("discourse/trailing-tail");
    expect(findings[0]!.severity).toBe("candidate");
    expect(findings[0]!.message).toContain("with a rule-based fallback parser");
    expect(findings[0]!.message).toContain("4 sentences end this way");
  });

  it("spans the whole sentence, not just the tail", () => {
    const findings = run(FOUR);
    const sliced = FOUR.slice(findings[0]!.span.start, findings[0]!.span.end);
    expect(sliced.startsWith("The scheduler rewrite")).toBe(true);
    expect(sliced).toContain("fallback parser");
  });

  // --- the gates ---------------------------------------------------------------------------

  it("stays silent below the absolute floor of four tails", () => {
    expect(run(`${filler(300)} ${TAIL} ${TAIL} ${TAIL}`)).toEqual([]);
  });

  it("stays silent below the rate floor, however many tails there are", () => {
    // 4 tails in ~1100 words is 3.6 per 1000 — under the threshold, and near the 2.98 per 1000
    // measured across this repository's own documentation.
    expect(run(`${filler(1060)} ${TAIL} ${TAIL} ${TAIL} ${TAIL}`)).toEqual([]);
  });

  it("stays silent on a document too short to have a rate", () => {
    expect(run(`${TAIL} ${TAIL} ${TAIL} ${TAIL}`)).toEqual([]);
  });

  it("is quiet on this repository's own prose, which is the calibration", () => {
    // The pooled rate across docs/ is 2.98 per 1000; nothing here should reach the floor.
    const humanish = `${filler(400)} ${TAIL} ${TAIL}`;
    expect(run(humanish)).toEqual([]);
  });

  // --- the strictness dial ------------------------------------------------------------------

  it("at strictness 3, one trailing phrase is enough", () => {
    const one = `${filler(300)} ${TAIL}`;
    expect(run(one, 2)).toEqual([]);
    expect(run(one, 3)).toHaveLength(1);
  });

  it("at strictness 3, the short-document guard stands down too", () => {
    expect(run(TAIL, 2)).toEqual([]);
    expect(run(TAIL, 3)).toHaveLength(1);
  });

  it("at strictness 3, the finding is promoted off candidate and drops the rate talk", () => {
    const findings = run(`${filler(300)} ${TAIL}`, 3);
    expect(findings[0]!.severity).toBe("low");
    expect(findings[0]!.message).not.toContain("per 1000");
    expect(findings[0]!.explanation).toContain("the shape is");
  });

  it("at strictness 1, the floors double and a borderline document goes quiet", () => {
    expect(run(FOUR, 2)).toHaveLength(4);
    expect(run(FOUR, 1)).toEqual([]); // needs 8 tails and 12 per 1000 at this level
  });

  it("defaults to strictness 2 when the engine is given no level", () => {
    expect(run(FOUR)).toEqual(run(FOUR, 2));
  });

  it("never invents a finding the shape test refused, at any level", () => {
    const coordination = `${filler(300)} It covers adjective complements, causative small clauses, and absolute phrases.`;
    for (const level of [1, 2, 3] as const) expect(run(coordination, level)).toEqual([]);
  });
});

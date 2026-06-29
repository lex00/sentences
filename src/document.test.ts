import { describe, it, expect } from "vitest";
import { parseDocument } from "./document.js";
import type { Nominal } from "./ir.js";

describe("parseDocument (split on . ! ? ; :)", () => {
  it("skips a leading fragment and diagrams the real clause after a colon", () => {
    const s = parseDocument("Interesting question in the Hacker News discussion: Why can Claude Mythos not identify fraud cases?");
    expect(s.clauses).toHaveLength(1); // fragment dropped, question kept
    expect((s.clauses[0]!.subject as Nominal).head.text).toBe("Mythos");
  });

  it("stacks two independent sentences with a null (no-connector) gap", () => {
    const s = parseDocument("The dog barked. The cat slept.");
    expect(s.clauses).toHaveLength(2);
    expect(s.conjunctions).toEqual([null]);
  });

  it("mixes coordination and separation: 'and' then a semicolon", () => {
    const s = parseDocument("Birds sing and dogs bark; the owl hooted.");
    expect(s.clauses).toHaveLength(3);
    expect(s.conjunctions.map((c) => c?.text ?? null)).toEqual(["and", null]);
  });

  it("throws when nothing is diagrammable (all fragments)", () => {
    expect(() => parseDocument("the red door. a blue car.")).toThrow();
  });
});

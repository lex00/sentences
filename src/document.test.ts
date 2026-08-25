import { describe, it, expect } from "vitest";
import { parseDocument, readDocument, splitUnits } from "./document.js";
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

describe("splitUnits (spans into the original text)", () => {
  it("slices each unit back out of the source exactly", () => {
    const text = "  The dog barked.  The cat slept! Really?";
    const units = splitUnits(text);
    expect(units.map((u) => u.unit)).toEqual(["The dog barked", "The cat slept", "Really"]);
    for (const u of units) expect(text.slice(u.span.start, u.span.end)).toBe(u.unit);
    expect(units[0]!.span).toEqual({ start: 2, end: 16 });
  });

  it("eats runs of terminators without emitting empty units", () => {
    expect(splitUnits("Wow?!... Yes.").map((u) => u.unit)).toEqual(["Wow", "Yes"]);
    expect(splitUnits("... ;: ")).toEqual([]);
  });
});

describe("readDocument (fragments are data, not drops)", () => {
  it("keeps every unit of a three-fragment document with its span", () => {
    const text = "Not a bug. Not a feature. A fundamental design flaw.";
    const units = readDocument(text);
    expect(units).toHaveLength(3);
    expect(units.map((u) => u.outcome)).toEqual(["fragment", "fragment", "fragment"]);
    expect(units.map((u) => u.unit)).toEqual(["Not a bug", "Not a feature", "A fundamental design flaw"]);
    for (const u of units) {
      expect(text.slice(u.span.start, u.span.end)).toBe(u.unit);
      expect(u.reason).toMatch(/no-verb|no-VP/); // the evidence a rule keys on
      expect(u.clauses).toBeUndefined();
    }
  });

  it("records lowered units with their clauses alongside the fragments", () => {
    const units = readDocument("Interesting question in the Hacker News discussion: Why can Claude Mythos not identify fraud cases?");
    expect(units.map((u) => u.outcome)).toEqual(["fragment", "lowered"]);
    expect(units[1]!.clauses).toHaveLength(1);
    expect((units[1]!.clauses![0]!.subject as Nominal).head.text).toBe("Mythos");
    expect(units[1]!.reason).toBeUndefined();
  });

  it("counts the clauses of a coordinated unit as one lowered record", () => {
    const units = readDocument("Birds sing and dogs bark; the owl hooted.");
    expect(units).toHaveLength(2);
    expect(units[0]!.clauses).toHaveLength(2); // "Birds sing and dogs bark"
    expect(units[1]!.clauses).toHaveLength(1);
  });
});

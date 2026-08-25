import { describe, it, expect } from "vitest";
import { parseDocument, parseDocumentWith, readDocument, readDocumentUnitsWith, readDocumentWith, ruleBasedParser, splitUnits } from "./document.js";
import { parseBracket, posTags } from "./ptb.js";
import { lowerSentence } from "./lower.js";
import type { Parser } from "./analyze.js";
import type { Nominal, Verbal } from "./ir.js";

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

// Stub parser: a lookup table standing in for a loaded ModelParser (no onnxruntime in the test).
// A unit that isn't in the table is one the "model" refuses.
const stub = (trees: Record<string, string>): Parser => ({
  parse: async (text) => {
    const ptb = trees[text];
    if (!ptb) throw new Error(`stub: no tree for ${JSON.stringify(text)}`);
    return parseBracket(ptb);
  },
});

describe("readDocumentWith / parseDocumentWith (parser-agnostic)", () => {
  it("prefers the supplied parser's own tree, with spans still indexing the original text", async () => {
    const text = "It's not bold. It's backwards.";
    // The chunker used to lose the contracted copula here and hand back two fragments (engine bug
    // #31); it now recovers it, expanding the clitic to "is" — see nlp/tagger.test.ts.
    const own = readDocument(text);
    expect(own.map((u) => u.outcome)).toEqual(["lowered", "lowered"]);
    expect((own[0]!.clauses![0]!.verb as Verbal).head.text).toBe("is");

    const units = await readDocumentWith(
      stub({
        "It's not bold": "(S (NP (PRP It)) (VP (VBZ 's) (ADJP (RB not) (JJ bold))))",
        "It's backwards": "(S (NP (PRP It)) (VP (VBZ 's) (ADJP (JJ backwards))))",
      }),
      text,
    );
    expect(units.map((u) => u.outcome)).toEqual(["lowered", "lowered"]);
    expect((units[0]!.clauses![0]!.verb as Verbal).head.text).toBe("'s"); // the stub's tree, not the chunker's
    expect(units.map((u) => u.span.start)).toEqual([0, 15]); // spans still index the original text
  });

  it("falls back to the rule-based parse per unit when the parser has nothing", async () => {
    const units = await readDocumentWith(stub({ "The dog barked": "(S (NP (DT The) (NN dog)) (VP (VBD barked)))" }), "The dog barked. The cat slept.");
    expect(units.map((u) => u.outcome)).toEqual(["lowered", "lowered"]); // second unit via the chunker
    expect((units[1]!.clauses![0]!.subject as Nominal).head.text).toBe("cat");
  });

  it("falls back when the parser's tree doesn't lower", async () => {
    const units = await readDocumentWith(stub({ "The dog barked": "(FRAG (NP (DT The) (NN dog)))" }), "The dog barked.");
    expect(units[0]!.outcome).toBe("lowered");
  });

  it("keeps the parser's own evidence when neither path lowers", async () => {
    const units = await readDocumentWith(stub({ "Not a bug": "(FRAG (RB Not) (NP (DT a) (NN bug)))" }), "Not a bug.");
    expect(units[0]!.outcome).toBe("fragment");
    expect(units[0]!.reason).toContain("FRAG/no-VP");
  });

  it("hands back the tree each unit's clauses came from", async () => {
    const parses = await readDocumentUnitsWith(stub({ "The dog barked": "(S (NP (DT The) (NN dog)) (VP (VBD barked)))" }), "The dog barked. The cat slept.");
    expect(parses.map((p) => p.doc.outcome)).toEqual(["lowered", "lowered"]);
    expect(posTags(parses[0]!.tree!).map((t) => t.tag)).toEqual(["DT", "NN", "VBD"]); // the stub's tree
    expect(posTags(parses[1]!.tree!).some((t) => t.word === "cat")).toBe(true); // the fallback's tree
    for (const p of parses) expect(lowerSentence(p.tree!).clauses).toEqual(p.doc.clauses); // the tree that lowered
  });

  it("hands back a FRAG tree for a unit that never lowered", async () => {
    const parses = await readDocumentUnitsWith(stub({ "Not a bug": "(FRAG (RB Not) (NP (DT a) (NN bug)))" }), "Not a bug.");
    expect(parses[0]!.doc.outcome).toBe("fragment");
    expect(parses[0]!.tree!.label).toBe("FRAG"); // rules inspect it; POS tags come off it
    expect(posTags(parses[0]!.tree!).map((t) => t.tag)).toEqual(["RB", "DT", "NN"]);
  });

  it("omits the tree only when no parser produced one", async () => {
    const parses = await readDocumentUnitsWith(stub({}), "a blue car. The dog barked.");
    expect(parses[0]!.tree).toBeUndefined(); // stub refused it, and the chunker can't parse it either
    expect(parses[1]!.tree).toBeDefined(); // stub refused it, but the chunker parsed it
  });

  it("with the rule-based parser, matches the sync default exactly", async () => {
    const text = "Birds sing and dogs bark; the owl hooted. A blue car.";
    expect(await parseDocumentWith(ruleBasedParser, text)).toEqual(parseDocument(text));
    expect(await readDocumentWith(ruleBasedParser, text)).toEqual(readDocument(text));
  });
});

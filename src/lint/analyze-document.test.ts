import { describe, it, expect } from "vitest";
import { analyzeDocument, adjacentUnits } from "./analyze-document.js";
import { ruleBasedParser } from "../document.js";
import { parseBracket } from "../ptb.js";
import type { Parser } from "../analyze.js";
import type { Nominal } from "../ir.js";
import type { TextMetrics } from "../layout.js";

const metrics: TextMetrics = { measure: (t, sz) => ({ width: t.length * sz * 0.55, ascent: sz * 0.8, descent: sz * 0.2 }) };

// Stub parser keyed by unit text, standing in for ModelParser (no onnxruntime in the test). A unit
// it doesn't know is refused, which sends readDocumentWith to its rule-based fallback.
const stub = (trees: Record<string, string>): Parser => ({
  parse: async (text: string) => {
    const ptb = trees[text];
    if (!ptb) throw new Error(`no parse for ${JSON.stringify(text)}`);
    return parseBracket(ptb);
  },
});

const DOG = "(S (NP (DT The) (NN dog)) (VP (VBD barked)))";
const CAT = "(S (NP (DT The) (NN cat)) (VP (VBD slept)))";

// The acceptance property: every word's span slices its surface form out of the ORIGINAL text.
const roundTrips = (doc: { text: string; units: Array<{ words: Array<{ text: string; span: { start: number; end: number } }> }> }) => {
  for (const u of doc.units) for (const w of u.words) expect(doc.text.slice(w.span.start, w.span.end)).toBe(w.text);
};

describe("analyzeDocument", () => {
  it("returns ordered units, each with tree, clauses and word spans into the ORIGINAL text", async () => {
    const text = "The dog barked. The cat slept.";
    const doc = await analyzeDocument(stub({ "The dog barked": DOG, "The cat slept": CAT }), text);
    expect(doc.text).toBe(text);
    expect(doc.units.map((u) => u.unit)).toEqual(["The dog barked", "The cat slept"]);
    roundTrips(doc);
    for (const u of doc.units) {
      expect(u.outcome).toBe("lowered");
      expect(u.tree).toBeDefined();
      expect(text.slice(u.span.start, u.span.end)).toBe(u.unit);
    }
    expect((doc.units[1]!.clauses![0]!.subject as Nominal).head.text).toBe("cat");
  });

  it("spans point into the whole document, not the unit slice", async () => {
    const text = "The dog barked. The cat slept.";
    const doc = await analyzeDocument(stub({ "The dog barked": DOG, "The cat slept": CAT }), text);
    expect(doc.units[1]!.words.find((w) => w.text === "cat")!.span).toEqual({ start: 20, end: 23 });
  });

  it("gives the same word in two units distinct offsets", async () => {
    const text = "The dog barked. The dog barked.";
    const doc = await analyzeDocument(stub({ "The dog barked": DOG }), text);
    roundTrips(doc);
    expect(doc.units.flatMap((u) => u.words.filter((w) => w.text === "dog").map((w) => w.span.start))).toEqual([4, 20]);
  });

  it("keeps contraction and curly-quote surface forms recoverable through a document", async () => {
    const text = "He won’t go. She won't stay.";
    const doc = await analyzeDocument(ruleBasedParser, text);
    roundTrips(doc);
    expect(doc.units[0]!.words.map((w) => w.text)).toEqual(["He", "won’t", "go"]);
    expect(doc.units[1]!.words.map((w) => w.text)).toEqual(["She", "wo", "n't", "stay"]);
  });

  it("attaches POS tags from the parse tree by leaf position", async () => {
    const doc = await analyzeDocument(stub({ "The dog barked": DOG }), "The dog barked.");
    expect(doc.units[0]!.words.map((w) => w.pos)).toEqual(["DT", "NN", "VBD"]);
  });

  it("tags what it can when the tree's leaves don't line up with the tokens", async () => {
    // Stub tree omits "The" — the forward walk still tags the words it recognizes.
    const doc = await analyzeDocument(stub({ "The dog barked": "(S (NP (NN dog)) (VP (VBD barked)))" }), "The dog barked.");
    expect(doc.units[0]!.words.map((w) => w.pos)).toEqual([undefined, "NN", "VBD"]);
  });

  it("keeps a verbless fragment as data, with its span, words and outcome", async () => {
    const text = "Not a bug. The dog barked.";
    const doc = await analyzeDocument(stub({ "The dog barked": DOG }), text);
    expect(doc.units).toHaveLength(2);
    expect(doc.units[0]!.outcome).toBe("fragment");
    expect(doc.units[0]!.reason).toBeTruthy();
    expect(doc.units[0]!.words.map((w) => w.text)).toEqual(["Not", "a", "bug"]);
    expect(doc.units[1]!.outcome).toBe("lowered"); // a fragment doesn't blind the units after it
    roundTrips(doc);
  });

  it("leaves the tree unset for a unit the parser refused, keeping words and spans", async () => {
    const text = "Not a bug. The dog barked.";
    const doc = await analyzeDocument(stub({ "The dog barked": DOG }), text);
    expect(doc.units[0]!.tree).toBeUndefined();
    expect(doc.units[0]!.words.every((w) => w.pos === undefined)).toBe(true);
    expect(doc.units[1]!.tree).toBeDefined(); // the recorder still lines up after a refusal
    expect(doc.units[1]!.words.map((w) => w.pos)).toEqual(["DT", "NN", "VBD"]);
  });

  it("lays out elements only when metrics are supplied", async () => {
    const p = stub({ "The dog barked": DOG });
    expect((await analyzeDocument(p, "The dog barked.")).units[0]!.elements).toBeUndefined();
    const withMetrics = await analyzeDocument(p, "The dog barked.", { metrics });
    const words = withMetrics.units[0]!.elements!.filter((e) => e.kind === "word");
    expect(words.find((e) => e.text === "barked")!.roleKey).toBe("verb");
  });

  it("works with the zero-download rule-based parser", async () => {
    const text = "The dog barked. The cat slept.";
    const doc = await analyzeDocument(ruleBasedParser, text);
    roundTrips(doc);
    expect(doc.units.map((u) => u.outcome)).toEqual(["lowered", "lowered"]);
    expect(doc.units.every((u) => u.tree !== undefined)).toBe(true);
  });

  it("adjacentUnits walks neighbours in order for cross-sentence rules", async () => {
    const text = "The dog barked. The cat slept. The dog barked.";
    const doc = await analyzeDocument(stub({ "The dog barked": DOG, "The cat slept": CAT }), text);
    const pairs = adjacentUnits(doc);
    expect(pairs.map(([a, b]) => [a.unit, b.unit])).toEqual([
      ["The dog barked", "The cat slept"],
      ["The cat slept", "The dog barked"],
    ]);
    // the repeated opener a reframe/anaphora rule would flag, located in the source
    expect(pairs[1]![1].span.start).toBe(31);
  });

  it("returns no units for text with nothing in it", async () => {
    expect((await analyzeDocument(stub({}), "  ... ")).units).toEqual([]);
  });
});

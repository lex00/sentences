import { describe, it, expect } from "vitest";
import { analyzeDocument, adjacentUnits, splitUnits } from "./analyze-document.js";
import { parseBracket } from "../ptb.js";
import type { Parser } from "../analyze.js";
import type { Nominal } from "../ir.js";
import type { TextMetrics } from "../layout.js";

const metrics: TextMetrics = { measure: (t, sz) => ({ width: t.length * sz * 0.55, ascent: sz * 0.8, descent: sz * 0.2 }) };

// Stub parser keyed by unit text, standing in for ModelParser (no onnxruntime in the test).
const stub = (trees: Record<string, string>): Parser => ({
  parse: async (text: string) => {
    const ptb = trees[text];
    if (!ptb) throw new Error(`no parse for ${JSON.stringify(text)}`);
    return parseBracket(ptb);
  },
});

const DOG = "(S (NP (DT The) (NN dog)) (VP (VBD barked)))";
const CAT = "(S (NP (DT The) (NN cat)) (VP (VBD slept)))";

describe("splitUnits", () => {
  it("gives each unit its source span, terminator excluded", () => {
    const text = "The dog barked. The cat slept.";
    const units = splitUnits(text);
    expect(units.map((u) => u.text)).toEqual(["The dog barked", "The cat slept"]);
    for (const u of units) expect(text.slice(u.span.start, u.span.end)).toBe(u.text);
    expect(units[1]!.span).toEqual({ start: 16, end: 29 });
  });

  it("splits on ; and : too, and drops empty runs", () => {
    const text = "Birds sing; the owl hooted!!  Really?";
    expect(splitUnits(text).map((u) => u.text)).toEqual(["Birds sing", "the owl hooted", "Really"]);
  });
});

describe("analyzeDocument", () => {
  it("returns ordered units, each with tree, clause IR and word spans into the ORIGINAL text", async () => {
    const text = "The dog barked. The cat slept.";
    const doc = await analyzeDocument(stub({ "The dog barked": DOG, "The cat slept": CAT }), text);
    expect(doc.text).toBe(text);
    expect(doc.units).toHaveLength(2);
    for (const u of doc.units) {
      expect(u.tree).toBeDefined();
      expect(u.error).toBeUndefined();
      for (const w of u.words) expect(text.slice(w.span.start, w.span.end)).toBe(w.text);
    }
    expect((doc.units[1]!.sentence!.clauses[0]!.subject as Nominal).head.text).toBe("cat");
  });

  it("spans point into the whole document, not the unit slice", async () => {
    const text = "The dog barked. The cat slept.";
    const doc = await analyzeDocument(stub({ "The dog barked": DOG, "The cat slept": CAT }), text);
    const cat = doc.units[1]!.words.find((w) => w.text === "cat")!;
    expect(cat.span).toEqual({ start: 20, end: 23 });
  });

  it("gives the same word in two units distinct offsets", async () => {
    const text = "The dog barked. The dog barked.";
    const doc = await analyzeDocument(stub({ "The dog barked": DOG }), text);
    const dogs = doc.units.flatMap((u) => u.words.filter((w) => w.text === "dog").map((w) => w.span.start));
    expect(dogs).toEqual([4, 20]);
  });

  it("keeps contraction and curly-quote surface forms recoverable through a document", async () => {
    const text = "He won’t go. She won't stay.";
    const doc = await analyzeDocument(stub({}), text);
    for (const u of doc.units) for (const w of u.words) expect(text.slice(w.span.start, w.span.end)).toBe(w.text);
    expect(doc.units[0]!.words.map((w) => w.text)).toEqual(["He", "won’t", "go"]);
    expect(doc.units[1]!.words.map((w) => w.text)).toEqual(["She", "wo", "n't", "stay"]);
  });

  it("attaches POS tags from the parse tree by leaf position", async () => {
    const text = "The dog barked.";
    const doc = await analyzeDocument(stub({ "The dog barked": DOG }), text);
    expect(doc.units[0]!.words.map((w) => w.pos)).toEqual(["DT", "NN", "VBD"]);
  });

  it("tags what it can when the tree's leaves don't line up with the tokens", async () => {
    // Stub tree omits "The" — the forward walk still tags the words it recognizes.
    const text = "The dog barked.";
    const doc = await analyzeDocument(stub({ "The dog barked": "(S (NP (NN dog)) (VP (VBD barked)))" }), text);
    expect(doc.units[0]!.words.map((w) => w.pos)).toEqual([undefined, "NN", "VBD"]);
  });

  it("keeps a unit that doesn't parse, with its span, words and an error", async () => {
    const text = "Interesting question here: The dog barked.";
    const doc = await analyzeDocument(stub({ "The dog barked": DOG }), text);
    expect(doc.units).toHaveLength(2);
    expect(doc.units[0]!.tree).toBeUndefined();
    expect(doc.units[0]!.error).toBeTruthy();
    expect(doc.units[0]!.words.map((w) => w.text)).toEqual(["Interesting", "question", "here"]);
    expect(doc.units[1]!.tree).toBeDefined(); // a fragment doesn't blind the units after it
  });

  it("lays out elements only when metrics are supplied", async () => {
    const p = stub({ "The dog barked": DOG });
    expect((await analyzeDocument(p, "The dog barked.")).units[0]!.elements).toBeUndefined();
    const withMetrics = await analyzeDocument(p, "The dog barked.", { metrics });
    const roles = withMetrics.units[0]!.elements!.filter((e) => e.kind === "word");
    expect(roles.find((e) => e.text === "barked")!.roleKey).toBe("verb");
  });

  it("adjacentUnits walks neighbours in order for cross-sentence rules", async () => {
    const text = "The dog barked. The cat slept. The dog barked.";
    const doc = await analyzeDocument(stub({ "The dog barked": DOG, "The cat slept": CAT }), text);
    const pairs = adjacentUnits(doc);
    expect(pairs.map(([a, b]) => [a.text, b.text])).toEqual([
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

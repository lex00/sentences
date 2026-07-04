import { describe, it, expect } from "vitest";
import { analyze, wordSlots, type Parser } from "./analyze.js";
import { parseBracket } from "./ptb.js";
import type { TextMetrics } from "./layout.js";

const metrics: TextMetrics = { measure: (t, sz) => ({ width: t.length * sz * 0.55, ascent: sz * 0.8, descent: sz * 0.2 }) };

// Stub parser: returns a fixed tree, standing in for ModelParser (no onnxruntime in the test).
const stub = (ptb: string): Parser => ({ parse: async () => parseBracket(ptb) });

describe("analyze (game-facing parse -> roles)", () => {
  it("parses a player's sentence to role-labeled elements", async () => {
    const a = await analyze(stub("(S (NP (DT The) (NN cat)) (VP (VBD caught) (NP (DT a) (NN mouse))))"), "The cat caught a mouse", metrics);
    const roleOf = (t: string) => a.elements.find((e) => e.kind === "word" && e.text === t) as { roleKey: string } | undefined;
    expect(roleOf("cat")?.roleKey).toBe("subject");
    expect(roleOf("caught")?.roleKey).toBe("verb");
    expect(roleOf("mouse")?.roleKey).toBe("object");
  });

  it("wordSlots returns every fillable word, ordered by x position", async () => {
    const a = await analyze(stub("(S (NP (DT The) (NN cat)) (VP (VBD caught) (NP (DT a) (NN mouse))))"), "x", metrics);
    const slots = wordSlots(a);
    expect([...slots.map((s) => s.text)].sort()).toEqual(["The", "a", "cat", "caught", "mouse"]);
    for (let i = 1; i < slots.length; i++) expect(slots[i]!.anchor.x).toBeGreaterThanOrEqual(slots[i - 1]!.anchor.x); // non-decreasing x
  });

  it("a criteria check can count roles for a free-write mode", async () => {
    // "must contain a direct object" -> at least one word with roleKey 'object'
    const a = await analyze(stub("(S (NP (PRP She)) (VP (VBZ reads) (NP (NNS books))))"), "She reads books", metrics);
    const hasObject = wordSlots(a).some((w) => w.roleKey === "object");
    expect(hasObject).toBe(true);
  });
});

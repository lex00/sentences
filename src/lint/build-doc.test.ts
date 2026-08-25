import { describe, it, expect } from "vitest";
import { buildDocAnalysis } from "./build-doc.js";
import { readDocument } from "../document.js";
import { textAt } from "./span.js";

describe("buildDocAnalysis (the #9 seam — TODO(#9): replace with analyzeDocument)", () => {
  const text = "The dog chased the ball. Not a bug.";

  it("keeps the original text untouched", () => {
    expect(buildDocAnalysis(text).text).toBe(text);
  });

  it("carries readDocument's units through as-is (unit, span, outcome, reason/clauses)", () => {
    const expected = readDocument(text);
    const doc = buildDocAnalysis(text);
    expect(doc.units.map((u) => u.unit)).toEqual(expected.map((u) => u.unit));
    expect(doc.units.map((u) => u.span)).toEqual(expected.map((u) => u.span));
    expect(doc.units.map((u) => u.outcome)).toEqual(expected.map((u) => u.outcome));
  });

  it("does not add a tree — nothing parsed further than readDocument already did", () => {
    for (const u of buildDocAnalysis(text).units) expect(u.tree).toBeUndefined();
  });

  it("scans every unit's words with offsets that slice back to the source surface form", () => {
    const doc = buildDocAnalysis(text);
    const words = doc.units.flatMap((u) => u.words);
    expect(words.map((w) => w.text)).toEqual(["The", "dog", "chased", "the", "ball", "Not", "a", "bug"]);
    for (const w of words) expect(textAt(doc, w.span)).toBe(w.text);
  });

  it("is deterministic: same text in, byte-identical analysis out", () => {
    const a = buildDocAnalysis(text);
    const b = buildDocAnalysis(text);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });
});

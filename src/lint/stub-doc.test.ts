import { describe, it, expect } from "vitest";
import { makeDoc, splitUnitSpans, spanOf } from "./stub-doc.js";
import { textAt } from "./span.js";

describe("makeDoc (stub DocAnalysis, no parser)", () => {
  it("splits on sentence punctuation and keeps the terminator with its unit", () => {
    const text = "The dog barked. The cat slept; the owl hooted.";
    const doc = makeDoc(text);
    expect(doc.units.map((u) => u.unit)).toEqual(["The dog barked.", "The cat slept;", "the owl hooted."]);
  });

  it("keeps a run of terminators in one unit", () => {
    expect(makeDoc("Wait?! Not a bug... A feature.").units.map((u) => u.unit))
      .toEqual(["Wait?!", "Not a bug...", "A feature."]);
  });

  it("breaks at a markdown block edge, so a heading is its own unit without punctuation", () => {
    expect(makeDoc("## Why this matters\nThe answer is simple.").units.map((u) => u.unit))
      .toEqual(["## Why this matters", "The answer is simple."]);
  });

  it("gives a bullet its own unit, and keeps its wrapped continuation with it", () => {
    expect(makeDoc("- First item\n  wrapped onto a second line\n- Second item").units.map((u) => u.unit))
      .toEqual(["- First item\n  wrapped onto a second line", "- Second item"]);
  });

  // The case this used to get wrong, and the reason it no longer breaks on a bare newline: one
  // sentence hard-wrapped across two lines is one sentence. Splitting it produced a second "unit"
  // starting mid-clause, which every fragment and opening-word rule then read as a real sentence.
  it("does NOT break hard-wrapped prose, which is one sentence across two lines", () => {
    expect(makeDoc("The rewrite shipped in March, a full\nrelease behind the roadmap.").units.map((u) => u.unit))
      .toEqual(["The rewrite shipped in March, a full\nrelease behind the roadmap."]);
  });

  // Two contiguous unmarked lines are genuinely ambiguous — a bare line is not a markdown heading,
  // and nothing structural separates "a title someone typed" from "prose that wrapped". They stay
  // together, because the wrapped reading is the one that is true of every hard-wrapped document
  // and the heading reading needs a marker to be more than a guess.
  it("keeps two unmarked lines together, marker or nothing", () => {
    expect(makeDoc("Why this matters\nThe answer is simple.").units.map((u) => u.unit))
      .toEqual(["Why this matters\nThe answer is simple."]);
  });

  it("gives every unit a span that slices back to its own text", () => {
    const text = "  The dog barked.   The cat slept.  ";
    const doc = makeDoc(text);
    for (const u of doc.units) expect(textAt(doc, u.span)).toBe(u.unit);
  });

  it("maps every word to offsets that slice back to the source surface form", () => {
    const text = "It isn’t a well-known bug. It's a feature.";
    const doc = makeDoc(text);
    const words = doc.units.flatMap((u) => u.words);
    expect(words.map((w) => w.text)).toEqual(["It", "isn’t", "a", "well-known", "bug", "It's", "a", "feature"]);
    for (const w of words) expect(textAt(doc, w.span)).toBe(w.text);
  });

  it("reports units as unparseable by default, and takes a per-unit override", () => {
    const text = "The dog barked. Not a bug.";
    expect(makeDoc(text).units.map((u) => u.outcome)).toEqual(["unparseable", "unparseable"]);
    const doc = makeDoc(text, (unit) => (unit.startsWith("Not") ? "fragment" : "lowered"));
    expect(doc.units.map((u) => u.outcome)).toEqual(["lowered", "fragment"]);
  });

  it("keeps the original text untouched", () => {
    const text = "  Spaced.  \n\n Out.  ";
    expect(makeDoc(text).text).toBe(text);
  });

  it("returns no units for whitespace-only input", () => {
    expect(makeDoc("   \n  ").units).toEqual([]);
    expect(splitUnitSpans("...").map((s) => s.start)).toEqual([0]); // bare punctuation is still a unit
  });
});

describe("spanOf", () => {
  const text = "It's not X. It's not Y.";

  it("finds the nth occurrence", () => {
    expect(textAt(text, spanOf(text, "It's not"))).toBe("It's not");
    expect(spanOf(text, "It's not", 2)).toEqual({ start: 12, end: 20 });
  });

  it("throws when the occurrence is missing, so a stale fixture fails loudly", () => {
    expect(() => spanOf(text, "It's not", 3)).toThrow(/occurrence 3/);
    expect(() => spanOf(text, "tapestry")).toThrow();
  });
});

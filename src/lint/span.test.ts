import { describe, it, expect } from "vitest";
import { textAt, spanning, sameSpan, overlaps, contains, compareSpans } from "./span.js";
import { makeDoc } from "./stub-doc.js";

describe("span helpers", () => {
  const text = "The dog chased the ball.";
  const doc = makeDoc(text);
  const words = doc.units[0]!.words;

  it("slices the source form out of a document or a bare string", () => {
    expect(textAt(doc, words[1]!.span)).toBe("dog");
    expect(textAt(text, { start: 0, end: 3 })).toBe("The");
  });

  it("spans a run of words, whitespace between them included", () => {
    expect(textAt(doc, spanning(words.slice(1, 4)))).toBe("dog chased the");
    expect(spanning([{ start: 9, end: 12 }, { start: 0, end: 4 }])).toEqual({ start: 0, end: 12 });
  });

  it("throws on an empty run rather than inventing a span", () => {
    expect(() => spanning([])).toThrow(/no parts/);
  });

  it("treats half-open ranges as touching, not overlapping", () => {
    expect(overlaps({ start: 0, end: 3 }, { start: 3, end: 5 })).toBe(false);
    expect(overlaps({ start: 0, end: 4 }, { start: 3, end: 5 })).toBe(true);
  });

  it("knows containment and identity", () => {
    expect(contains({ start: 0, end: 10 }, { start: 2, end: 5 })).toBe(true);
    expect(contains({ start: 2, end: 5 }, { start: 0, end: 10 })).toBe(false);
    expect(contains({ start: 0, end: 4 }, { start: 0, end: 4 })).toBe(true);
    expect(sameSpan({ start: 0, end: 4 }, { start: 0, end: 4 })).toBe(true);
    expect(sameSpan({ start: 0, end: 4 }, { start: 0, end: 5 })).toBe(false);
  });

  it("sorts by start, then puts the shorter span first", () => {
    const spans = [{ start: 5, end: 9 }, { start: 0, end: 9 }, { start: 0, end: 4 }];
    expect([...spans].sort(compareSpans)).toEqual([{ start: 0, end: 4 }, { start: 0, end: 9 }, { start: 5, end: 9 }]);
  });
});

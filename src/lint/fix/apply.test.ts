import { describe, it, expect } from "vitest";
import { spanOf } from "../stub-doc.js";
import { applyEdits, remapId, remapOffset, remapSpan, splicesFor, validateFix } from "./apply.js";
import type { Splice } from "./apply.js";
import type { Fix, TextEdit } from "./types.js";
import { SEAM_CHARS } from "./types.js";

const del = (start: number, end: number): TextEdit => ({ kind: "delete", span: { start, end } });
const repair = (start: number, end: number, replacement: string): TextEdit => ({
  kind: "repair",
  span: { start, end },
  replacement,
});
const move = (start: number, end: number, to: number): TextEdit => ({ kind: "move", span: { start, end }, to });

describe("applyEdits", () => {
  const text = "This is a very good idea.";

  it("deletes a span", () => {
    expect(applyEdits(text, [del(...spanTuple(text, "very "))])).toBe("This is a good idea.");
  });

  it("applies several non-overlapping edits in one pass, back to front in effect", () => {
    const t = "one two three four";
    expect(applyEdits(t, [del(0, 4), del(8, 14)])).toBe("two four");
  });

  it("repairs punctuation and case at a seam", () => {
    expect(applyEdits("very good.", [del(0, 4), repair(4, 5, ""), repair(5, 6, "G")])).toBe("Good.");
  });

  it("moves a span without inventing anything", () => {
    const t = "Here is B A ok.";
    expect(applyEdits(t, [move(10, 11, 8), repair(11, 12, "")])).toBe("Here is AB ok.");
  });

  it("refuses overlapping edits rather than picking a winner", () => {
    expect(() => applyEdits(text, [del(0, 6), del(4, 9)])).toThrow(/overlapping edits/);
  });

  it("refuses a repair that smuggles in a word", () => {
    expect(() => applyEdits("delve into it", [repair(0, 5, "explore")])).toThrow(/punctuation-and-case only/);
  });

  it("refuses a move whose destination sits inside the span it moves", () => {
    expect(() => applyEdits(text, [move(0, 6, 3)])).toThrow(/inside the span/);
    expect(() => applyEdits(text, [move(0, 6, 0)])).toThrow(/inside the span/);
  });

  it("refuses two insertions at the same offset, whose order would be undefined", () => {
    expect(() => applyEdits("abcdef", [move(1, 2, 5), move(3, 4, 5)])).toThrow(/two insertions/);
  });

  it("refuses an edit that does not fit the document", () => {
    expect(() => applyEdits("short", [del(2, 99)])).toThrow(/does not fit/);
  });

  it("leaves adjacent edits alone — touching is not overlapping", () => {
    expect(applyEdits("a very good", [repair(1, 2, ""), del(2, 6)])).toBe("a good");
  });
});

// spanOf returns a Span; delete takes two numbers.
function spanTuple(text: string, needle: string): [number, number] {
  const s = spanOf(text, needle);
  return [s.start, s.end];
}

describe("validateFix — a fix may not reach outside its finding", () => {
  const text = "This is a very good idea.";
  const at = (edits: TextEdit[], start = 10, end = 14): Fix => ({
    findingId: { ruleId: "demo/intensifier", span: { start, end } },
    edits,
  });

  it("accepts a delete inside the finding span", () => {
    expect(validateFix(text, at([del(10, 14)]))).toBeNull();
  });

  it("rejects a delete that reaches past the finding span", () => {
    expect(validateFix(text, at([del(10, 15)]))).toMatch(/falls outside the finding span/);
    expect(validateFix(text, at([del(9, 14)]))).toMatch(/falls outside the finding span/);
  });

  it("lets a repair reach exactly SEAM_CHARS past each edge, and no further", () => {
    // text[14..16) is " g": dropping the stranded space is exactly what the allowance is for.
    expect(validateFix(text, at([del(10, 14), repair(14, 14 + SEAM_CHARS, "g")]))).toBeNull();
    expect(validateFix(text, at([del(10, 14), repair(14, 15 + SEAM_CHARS, " go")]))).toMatch(/reaches more than/);
    expect(validateFix(text, at([del(10, 14), repair(10 - SEAM_CHARS - 1, 10, "a very")]))).toMatch(/reaches more than/);
  });

  it("keeps a move's destination inside the finding span", () => {
    expect(validateFix(text, at([move(12, 14, 10)]))).toBeNull();
    expect(validateFix(text, at([move(12, 14, 2)]))).toMatch(/move destination/);
  });

  it("rejects a fix with no edits, and one whose edits overlap each other", () => {
    expect(validateFix(text, at([]))).toBe("fix has no edits");
    expect(validateFix(text, at([del(10, 13), del(12, 14)]))).toMatch(/overlapping edits/);
  });

  it("rejects a finding span that does not fit the document", () => {
    expect(validateFix(text, at([del(10, 14)], 0, 999))).toMatch(/finding span .* does not fit/);
  });
});

describe("remapping — where an old offset lands after an edit", () => {
  const text = "one two three four";

  it("shifts offsets downstream of a delete and leaves upstream ones alone (rule 1)", () => {
    const s = splicesFor(text, [del(4, 8)]); // drop "two "
    expect(remapOffset(0, s)).toBe(0);
    expect(remapOffset(4, s)).toBe(4);
    expect(remapOffset(8, s)).toBe(4);
    expect(remapOffset(14, s)).toBe(10);
  });

  it("gives an offset inside a length-changing edit no image at all (rule 2)", () => {
    const s = splicesFor(text, [del(4, 8)]);
    expect(remapOffset(5, s)).toBeNull();
    expect(remapOffset(7, s)).toBeNull();
  });

  it("maps straight through a length-preserving repair, because a case flip moves nothing (rule 2)", () => {
    const s = splicesFor("one two", [repair(0, 1, "O")]);
    expect(remapOffset(0, s)).toBe(0);
    expect(remapOffset(1, s)).toBe(1);
    expect(remapOffset(5, s)).toBe(5);
  });

  it("gives an offset sitting on an insertion no image, since either side is defensible (rule 3)", () => {
    const s = splicesFor(text, [move(0, 3, 8)]);
    expect(remapOffset(8, s)).toBeNull();
  });

  it("declares a span that a delete cuts into to be gone, not moved (rule 4)", () => {
    const s = splicesFor(text, [del(4, 8)]);
    expect(remapSpan({ start: 4, end: 7 }, s)).toBeNull();
    expect(remapSpan({ start: 0, end: 6 }, s)).toBeNull();
    expect(remapSpan({ start: 0, end: 4 }, s)).toEqual({ start: 0, end: 4 }); // touching is not overlapping
    expect(remapSpan({ start: 8, end: 13 }, s)).toEqual({ start: 4, end: 9 });
  });

  it("declares a span a move lands in to be gone, edges included (rule 4)", () => {
    const s = splicesFor(text, [move(0, 3, 8)]);
    expect(remapSpan({ start: 8, end: 13 }, s)).toBeNull();
    expect(remapSpan({ start: 4, end: 8 }, s)).toBeNull(); // the insertion touches its end
  });

  it("carries a span straight through a repair, because a repair cannot change a word (rule 5)", () => {
    // "Very really good." with "Very " deleted and "r" capitalized: the "really" finding is the
    // same finding, four characters to the left, even though the repair rewrote its first letter.
    const t = "Very really good.";
    const s = splicesFor(t, [del(0, 4), repair(4, 5, ""), repair(5, 6, "R")]);
    expect(remapSpan(spanOf(t, "really"), s)).toEqual({ start: 0, end: 6 });
  });

  it("remaps a whole finding id, keeping the rule", () => {
    const s = splicesFor(text, [del(0, 4)]);
    expect(remapId({ ruleId: "a/b", span: { start: 4, end: 7 } }, s)).toEqual({
      ruleId: "a/b",
      span: { start: 0, end: 3 },
    });
    expect(remapId({ ruleId: "a/b", span: { start: 1, end: 7 } }, s)).toBeNull();
  });

  it("remaps against splices in any order", () => {
    const s = splicesFor(text, [del(8, 14), del(0, 4)]);
    const reversed: Splice[] = [...s].reverse();
    expect(remapOffset(16, s)).toBe(remapOffset(16, reversed));
    expect(remapOffset(16, s)).toBe(6);
  });
});

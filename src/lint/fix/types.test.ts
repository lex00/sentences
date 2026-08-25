import { describe, it, expect } from "vitest";
import { REPAIR_AFFIX, findingKey, idOf, isValidRepair, keyOf, repairCore } from "./types.js";
import type { Finding } from "../types.js";

const finding = (ruleId: string, start: number, end: number, message = "m"): Finding => ({
  ruleId,
  span: { start, end },
  severity: "low",
  message,
  explanation: "e",
});

describe("finding identity", () => {
  it("is ruleId + span, the same key the engine dedupes on", () => {
    expect(findingKey(finding("a/b", 3, 9))).toBe(findingKey(finding("a/b", 3, 9)));
    expect(findingKey(finding("a/b", 3, 9))).not.toBe(findingKey(finding("a/b", 3, 10)));
    expect(findingKey(finding("a/b", 3, 9))).not.toBe(findingKey(finding("a/c", 3, 9)));
  });

  it("ignores message and severity, because density rewrites both when a sibling is fixed", () => {
    const dense = { ...finding("demo/intensifier", 0, 4, "3 filler intensifiers in this piece"), severity: "medium" as const };
    const sparse = finding("demo/intensifier", 0, 4, "adds emphasis, not meaning");
    expect(findingKey(dense)).toBe(findingKey(sparse));
  });

  it("length-prefixes the rule id so a colon in an id cannot collide", () => {
    expect(keyOf({ ruleId: "a:b", span: { start: 1, end: 2 } })).not.toBe(
      keyOf({ ruleId: "a", span: { start: 0, end: 0 } }),
    );
  });

  it("copies the span, so a caller mutating a finding cannot rewrite an id already taken", () => {
    const f = finding("a/b", 3, 9);
    const id = idOf(f);
    f.span.start = 100;
    expect(id.span.start).toBe(3);
  });
});

describe("repairCore", () => {
  it("strips only the fixed affix alphabet", () => {
    expect(repairCore("  hello,  ")).toBe("hello");
    expect(repairCore(";.,  ")).toBe("");
    expect(repairCore("—hello—")).toBe("—hello—"); // an em dash is not in the alphabet
    expect(repairCore("!hello!")).toBe("!hello!");
  });

  it("has exactly six characters in its alphabet", () => {
    expect([...REPAIR_AFFIX].sort()).toEqual(["\t", "\n", " ", ",", ".", ";"].sort());
  });
});

describe("isValidRepair — the invariant that makes a repair not a rewrite", () => {
  it("allows leading and trailing punctuation and whitespace to change", () => {
    expect(isValidRepair("very ", "very")).toBe(true);
    expect(isValidRepair(", and", "and")).toBe(true);
    expect(isValidRepair(" ", "")).toBe(true);
    expect(isValidRepair("done", "done.")).toBe(true);
    expect(isValidRepair("done.", "done;")).toBe(true);
    expect(isValidRepair("  word  ", ", word.")).toBe(true);
  });

  it("allows the case of the first letter to flip, in either direction", () => {
    expect(isValidRepair("r", "R")).toBe(true);
    expect(isValidRepair("really,", "Really")).toBe(true);
    expect(isValidRepair("Good", "good")).toBe(true);
  });

  it("refuses a case change anywhere but the first letter", () => {
    expect(isValidRepair("the tapestry", "the Tapestry")).toBe(false);
    expect(isValidRepair("ab", "aB")).toBe(false);
  });

  it("refuses any replacement that changes a word", () => {
    expect(isValidRepair("delve", "explore")).toBe(false);
    expect(isValidRepair("very good", "good")).toBe(false);
    expect(isValidRepair("x", "")).toBe(false);
    expect(isValidRepair("", "x")).toBe(false);
    expect(isValidRepair("word", "word word")).toBe(false);
  });

  it("refuses characters outside the alphabet, including the em dash a fixer must never hand out", () => {
    expect(isValidRepair("a", "a—")).toBe(false);
    expect(isValidRepair("a b", "a—b")).toBe(false);
    expect(isValidRepair("word", "word!")).toBe(false);
  });

  it("refuses a case mapping that changes length rather than guessing at it", () => {
    expect(isValidRepair("ß", "SS")).toBe(false);
  });
});

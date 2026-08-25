// The end-to-end claim, on one paragraph carrying all three of #24's patterns at once: a countdown,
// a reframe, and a four-item pile.
//
// What is asserted here is the property the whole epic is for, not just three output strings. The
// fixed paragraph's findings are a SUBSET of the ones the paragraph started with — followed finding
// by finding through remapThrough, not inferred from the count — and every character in the output
// either came from the input or is one of the six the repair alphabet allows. So "the document got
// better" is a containment and a character set, both checkable, rather than an opinion about prose.

import { describe, expect, it } from "vitest";
import type { Clause, Compound, Nominal } from "../../../ir.js";
import { buildDocAnalysis } from "../../build-doc.js";
import { RULES } from "../../registry.js";
import type { DocAnalysis } from "../../types.js";
import { fixLoop, remapThrough } from "../loop.js";
import { defaultProvider } from "../registry.js";
import { REPAIR_AFFIX, findingKey } from "../types.js";

const SLOP = [
  "Not a bug.",
  "Not a feature.",
  "A fundamental design flaw.",
  "The problem was not the code; it was your head.",
  "The platform handles identity, payments, compute, and distribution.",
].join(" ");

const FIXED = [
  "A fundamental design flaw, not a bug, not a feature.",
  "The problem was your head.",
  "The platform handles identity, payments, compute, and distribution.",
].join(" ");

// readDocument's real analysis, with one hand-built compound dropped onto the list sentence. The
// rule-based chunker does not build an N-item Compound from comma-separated text (see
// rules/tricolon.test.ts), so without this the tricolon would simply not be in the paragraph. Keyed
// on the unit's TEXT, which no fixer here changes, so it keeps matching as offsets shift underneath.
const LIST_OPENER = "The platform handles";

function analyze(text: string): DocAnalysis {
  const doc = buildDocAnalysis(text);
  for (const u of doc.units) {
    if (!u.unit.startsWith(LIST_OPENER)) continue;
    const items: Nominal[] = ["identity", "payments", "compute", "distribution"].map((t) => ({
      head: { text: t },
      modifiers: [],
    }));
    const value: Compound<Nominal> = { items, conjunction: { text: "and" } };
    const clause: Clause = {
      subject: { head: { text: "platform" }, modifiers: [] },
      verb: { head: { text: "handles" }, modifiers: [] },
      complement: { kind: "directObject", value },
    };
    u.outcome = "lowered";
    u.clauses = [clause];
  }
  return doc;
}

const letters = (s: string): string[] => (s.toLowerCase().match(/[\p{L}\p{N}]/gu) ?? []);
const words = (s: string): string[] => (s.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []);

// Multiset containment: every element of `part` appears in `whole` at least as often.
function containedIn(part: readonly string[], whole: readonly string[]): boolean {
  const left = new Map<string, number>();
  for (const w of whole) left.set(w, (left.get(w) ?? 0) + 1);
  for (const p of part) {
    const n = left.get(p) ?? 0;
    if (n === 0) return false;
    left.set(p, n - 1);
  }
  return true;
}

describe("a slop paragraph with all three patterns", () => {
  const out = fixLoop(RULES, SLOP, defaultProvider, { analyze });

  it("produces exactly the reachable text", () => {
    expect(out.text).toBe(FIXED);
  });

  it("fixes the countdown and the reframe and leaves the pile for a human", () => {
    expect(out.before.findings.map((f) => f.ruleId).sort()).toContain("discourse/countdown");
    expect(out.before.findings.map((f) => f.ruleId)).toContain("reframe");
    expect(out.before.findings.map((f) => f.ruleId)).toContain("tricolon/density");
    expect(out.after.findings.map((f) => f.ruleId)).toEqual(["tricolon/density"]);
    expect(out.applied).toHaveLength(2);
    expect(out.rejected).toEqual([]);
  });

  it("every remaining finding is one the paragraph started with, followed step by step", () => {
    const carried = new Set<string>();
    for (const f of out.before.findings) {
      const key = remapThrough(f, out.steps);
      if (key) carried.add(key);
    }
    for (const f of out.after.findings) expect(carried.has(findingKey(f))).toBe(true);
    expect(out.after.findings.length).toBeLessThan(out.before.findings.length);
  });

  it("adds no word and no letter the author did not write", () => {
    expect(containedIn(words(out.text), words(SLOP))).toBe(true);
    expect(containedIn(letters(out.text), letters(SLOP))).toBe(true);
  });

  it("adds no character outside the repair alphabet", () => {
    const source = new Set(SLOP);
    for (const c of out.text) expect(source.has(c) || REPAIR_AFFIX.has(c)).toBe(true);
  });

  it("converges well inside the seatbelt and never throws a rule", () => {
    expect(out.iterations).toBeLessThan(10);
    expect(out.after.errors).toEqual([]);
    expect(out.before.errors).toEqual([]);
  });

  it("is idempotent — running the loop on its own output changes nothing", () => {
    const again = fixLoop(RULES, out.text, defaultProvider, { analyze });
    expect(again.text).toBe(out.text);
    expect(again.applied).toEqual([]);
  });
});

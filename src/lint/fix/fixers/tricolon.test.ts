// Round-trip fixtures for the tricolon trim (#24).
//
// The trim is a PROPOSAL API, not an automatic fixer: which item of a four-item pile is weakest is a
// judgement, and fixLoop is autonomous. So the round trip proved here is per proposal — input text,
// the exact text that one choice produces, and a re-lint of that text showing the pile is down to
// three and the finding gone.
//
// The fixtures need a DocAnalysis whose clauses hold a genuine N-item Compound, which the rule-based
// chunker does not build from raw comma-separated text (rules/tricolon.test.ts says so at length and
// hand-builds its IR for the same reason). `analyzeSeries` below does the same, but over REAL source
// offsets, because unlike the rule the fixer has to point at characters. Its item count comes from a
// deliberately different scan than fixers/tricolon.ts's — split on every comma and conjunction,
// count the non-blank pieces — so a bug in readSeries cannot hide behind an identically-wrong
// oracle.

import { describe, expect, it } from "vitest";
import type { Clause, Compound, Nominal } from "../../../ir.js";
import { runRules } from "../../engine.js";
import { makeDoc } from "../../stub-doc.js";
import { tricolonRule } from "../../rules/tricolon.js";
import type { DocAnalysis, Finding, TropeRule } from "../../types.js";
import { applyEdits, validateFix } from "../apply.js";
import { fixLoop } from "../loop.js";
import { defaultProvider } from "../registry.js";
import { tricolonProposalCount, tricolonProposals } from "./tricolon.js";

const RULES: readonly TropeRule[] = [tricolonRule];

// How many items a series has, counted the naive way: cut on every comma and every conjunction and
// keep the pieces with words in them.
const countItems = (unit: string): number =>
  unit
    .split(/,|\b(?:and|or|nor)\b/i)
    .filter((p) => /[\p{L}\p{N}]/u.test(p)).length;

// Real spans and words from stub-doc, plus a hand-built clause per unit whose direct object is a
// Compound of the counted size. That is the shape rules/tricolon.ts walks.
function analyzeSeries(text: string): DocAnalysis {
  const doc = makeDoc(text, "lowered");
  for (const u of doc.units) {
    const n = countItems(u.unit);
    if (n < 2) continue;
    const items: Nominal[] = Array.from({ length: n }, (_, i) => ({ head: { text: `item${i + 1}` }, modifiers: [] }));
    const value: Compound<Nominal> = { items, conjunction: { text: "and" } };
    const clause: Clause = {
      subject: { head: { text: "platform" }, modifiers: [] },
      verb: { head: { text: "handles" }, modifiers: [] },
      complement: { kind: "directObject", value },
    };
    u.clauses = [clause];
  }
  return doc;
}

const only = (text: string): { doc: DocAnalysis; finding: Finding } => {
  const doc = analyzeSeries(text);
  const hits = tricolonRule.detect(doc).filter((f) => f.ruleId === "tricolon/density");
  expect(hits).toHaveLength(1);
  return { doc, finding: hits[0]! };
};

// Apply every proposal for a text and hand back the resulting strings, in the order offered.
function outcomes(text: string): string[] {
  const { doc, finding } = only(text);
  const fixes = tricolonProposals(finding, doc);
  return fixes.map((f) => {
    expect(validateFix(text, f)).toBeNull();
    expect(f.findingId.span).toEqual(finding.span);
    return applyEdits(text, f.edits);
  });
}

describe("tricolon trim — a four-item pile", () => {
  const BEFORE = "The platform handles identity, payments, compute, and distribution.";

  it("offers one choice per droppable item — items 2, 3 and 4", () => {
    expect(outcomes(BEFORE)).toEqual([
      "The platform handles identity, compute, and distribution.",
      "The platform handles identity, payments, and distribution.",
      "The platform handles identity, payments, and compute.",
    ]);
  });

  // Item 1 is not droppable: its right edge is the first comma but its left edge is wherever the
  // series starts inside the clause, and nothing in the source says where "handles" stops and
  // "identity" begins. See the header of fixers/tricolon.ts.
  it("never offers to drop the first item", () => {
    for (const out of outcomes(BEFORE)) expect(out).toContain("identity");
  });

  it("every choice re-lints with the pile down to three and the finding gone", () => {
    expect(runRules(RULES, analyzeSeries(BEFORE)).findings.map((f) => f.ruleId)).toEqual(["tricolon/density"]);
    for (const out of outcomes(BEFORE)) {
      expect(countItems(out)).toBe(3);
      const after = runRules(RULES, analyzeSeries(out));
      expect(after.findings).toEqual([]);
      expect(after.errors).toEqual([]);
    }
  });

  it("adds no word the author did not write", () => {
    const words = (s: string) => (s.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []);
    const source = new Set(words(BEFORE));
    for (const out of outcomes(BEFORE)) for (const w of words(out)) expect(source.has(w)).toBe(true);
  });
});

describe("tricolon trim — a five-item pile", () => {
  const BEFORE = "The stack covers identity, payments, compute, distribution, and support.";

  it("offers four choices", () => {
    expect(outcomes(BEFORE)).toEqual([
      "The stack covers identity, compute, distribution, and support.",
      "The stack covers identity, payments, distribution, and support.",
      "The stack covers identity, payments, compute, and support.",
      "The stack covers identity, payments, compute, and distribution.",
    ]);
  });

  it("each choice leaves four items — one trim is not enough for a five", () => {
    for (const out of outcomes(BEFORE)) expect(countItems(out)).toBe(4);
  });
});

describe("tricolon trim — the series shapes it reads", () => {
  it("no Oxford comma: the conjunction still moves in front of the survivor", () => {
    expect(outcomes("The platform handles identity, payments, compute and distribution.")).toEqual([
      "The platform handles identity, compute and distribution.",
      "The platform handles identity, payments and distribution.",
      "The platform handles identity, payments, and compute.",
    ]);
  });

  it("an \"or\" series is read the same way", () => {
    expect(outcomes("It is a bug, a feature, a regression, or a design flaw.")).toEqual([
      "It is a bug, a regression, or a design flaw.",
      "It is a bug, a feature, or a design flaw.",
      "It is a bug, a feature, or a regression.",
    ]);
  });

  it("multi-word items keep all their words", () => {
    expect(outcomes("We shipped a new parser, a faster renderer, a smaller bundle, and a dark theme.")).toEqual([
      "We shipped a new parser, a smaller bundle, and a dark theme.",
      "We shipped a new parser, a faster renderer, and a dark theme.",
      "We shipped a new parser, a faster renderer, and a smaller bundle.",
    ]);
  });
});

describe("tricolon trim — when it offers nothing", () => {
  it("withholds the last-item choice when the sentence continues past the series", () => {
    // "…, and distribution matter here" gives no boundary for the final item — it looks like a
    // three-word member of a list of one-word members — so that one choice is withheld and the two
    // comma-delimited ones, whose edges are not in doubt, are still offered.
    expect(outcomes("Identity, payments, compute, and distribution matter here.")).toEqual([
      "Identity, compute, and distribution matter here.",
      "Identity, payments, and distribution matter here.",
    ]);
  });

  it("declines a series with no commas", () => {
    const doc = analyzeSeries("The platform handles identity and payments and compute and distribution.");
    for (const f of tricolonRule.detect(doc)) {
      expect(tricolonProposals(f, doc)).toEqual([]);
      expect(tricolonProposalCount(f, doc)).toBe(0);
    }
  });

  it("declines the whole-document density finding, which names no series", () => {
    const text = "It ships identity, payments, compute, and distribution. It ships identity, payments, compute, and distribution. It ships identity, payments, compute, and distribution.";
    const doc = analyzeSeries(text);
    const docWide = runRules(RULES, doc).findings.filter((f) => f.ruleId === "tricolon/document-density");
    expect(docWide).toHaveLength(1);
    expect(tricolonProposals(docWide[0]!, doc)).toEqual([]);
  });
});

describe("tricolon trim — the loop leaves it alone", () => {
  it("no automatic fix is proposed, so the finding survives and is reported", () => {
    const text = "The platform handles identity, payments, compute, and distribution.";
    const { doc, finding } = only(text);
    expect(defaultProvider(finding, doc)).toBeNull();

    const out = fixLoop(RULES, text, defaultProvider, { analyze: analyzeSeries });
    expect(out.text).toBe(text);
    expect(out.applied).toEqual([]);
    expect(out.after.findings.map((f) => f.ruleId)).toEqual(["tricolon/density"]);
  });
});

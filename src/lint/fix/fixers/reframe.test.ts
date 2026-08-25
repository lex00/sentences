// Round-trip fixtures for the reframe collapse (#24).
//
// These run against readDocument (build-doc.ts) rather than the stub, because the fixer reads the
// Clause IR — `isCopular`, `isNegated`, and the verb head it locates in the source — and stub-doc.ts
// carries no clauses at all. That also means these fixtures are pinned to what the shipped no-model
// path actually parses today, which is the same set rules/reframe.ts's own end-to-end tests use:
// uncontracted copulas, two units or a semicolon.

import { describe, expect, it } from "vitest";
import { buildDocAnalysis } from "../../build-doc.js";
import { runRules } from "../../engine.js";
import { reframeRule } from "../../rules/reframe.js";
import type { DocAnalysis, Finding, TropeRule } from "../../types.js";
import { applyEdits, validateFix } from "../apply.js";
import { fixLoop } from "../loop.js";
import { defaultProvider } from "../registry.js";
import { reframeCollapse, reframeContrast, reframeProposals } from "./reframe.js";

const RULES: readonly TropeRule[] = [reframeRule];

const only = (text: string): { doc: DocAnalysis; finding: Finding } => {
  const doc = buildDocAnalysis(text);
  const hits = reframeRule.detect(doc);
  expect(hits).toHaveLength(1);
  return { doc, finding: hits[0]! };
};

// Apply one of the two shapes and hand back the exact resulting text.
function run(text: string, shape: typeof reframeCollapse): string {
  const { doc, finding } = only(text);
  const fix = shape(finding, doc);
  expect(fix).not.toBeNull();
  expect(validateFix(text, fix!)).toBeNull();
  return applyEdits(text, fix!.edits);
}

const relint = (t: string) => runRules(RULES, buildDocAnalysis(t));

describe("reframe collapse — pure deletion", () => {
  const cases: ReadonlyArray<[string, string]> = [
    ["The problem was not the code; it was your head.", "The problem was your head."],
    ["That is not innovation. That is innovation wearing old clothes.", "That is innovation wearing old clothes."],
    ["The question is not the cost. The question is the timeline.", "The question is the timeline."],
  ];

  for (const [before, after] of cases) {
    it(JSON.stringify(before), () => {
      expect(run(before, reframeCollapse)).toBe(after);
    });

    it(`re-lints clean: ${JSON.stringify(after)}`, () => {
      expect(relint(before).findings.map((f) => f.ruleId)).toEqual(["reframe"]);
      expect(relint(after).findings).toEqual([]);
      expect(relint(after).errors).toEqual([]);
    });
  }

  it("the output is a subsequence of the input — no word the author did not write", () => {
    const before = "The problem was not the code; it was your head.";
    const after = run(before, reframeCollapse);
    const words = (s: string): string[] => s.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
    // Every output word appears, in order, among the input's words.
    const source = words(before);
    let i = 0;
    for (const w of words(after)) {
      i = source.indexOf(w, i);
      expect(i).toBeGreaterThanOrEqual(0);
      i++;
    }
  });
});

describe("reframe contrast — the \", not X\" enrichment", () => {
  // Reachable because "not the code" is MOVED, not retyped, and the joining comma is a trailing
  // affix on "head" — see fixers/reframe.ts. The issue's illustration ("It's backwards wearing bold
  // clothes.") needs the word "wearing", which the input does not contain, so it is not reachable.
  const cases: ReadonlyArray<[string, string]> = [
    ["The problem was not the code; it was your head.", "The problem was your head, not the code."],
    [
      "That is not innovation. That is innovation wearing old clothes.",
      "That is innovation wearing old clothes, not innovation.",
    ],
    ["The question is not the cost. The question is the timeline.", "The question is the timeline, not the cost."],
  ];

  for (const [before, after] of cases) {
    it(JSON.stringify(before), () => {
      expect(run(before, reframeContrast)).toBe(after);
      expect(relint(after).findings).toEqual([]);
    });
  }

  it("is offered as a proposal but is not what the loop applies", () => {
    const text = "The problem was not the code; it was your head.";
    const { doc, finding } = only(text);
    const proposals = reframeProposals(finding, doc);
    expect(proposals).toHaveLength(2);
    expect(applyEdits(text, proposals[0]!.edits)).toBe("The problem was your head.");
    expect(applyEdits(text, proposals[1]!.edits)).toBe("The problem was your head, not the code.");
    for (const p of proposals) expect(validateFix(text, p)).toBeNull();
    // The registered fixer is the first proposal.
    expect(defaultProvider(finding, doc)!.edits).toEqual(proposals[0]!.edits);
  });
});

describe("reframe collapse — through the loop", () => {
  it("accepts the collapse and stops", () => {
    const out = fixLoop(RULES, "The problem was not the code; it was your head.", defaultProvider, {
      analyze: buildDocAnalysis,
    });
    expect(out.text).toBe("The problem was your head.");
    expect(out.after.findings).toEqual([]);
    expect(out.rejected).toEqual([]);
    expect(out.applied).toHaveLength(1);
  });

  it("fixes two reframes in one document", () => {
    const text = "The problem was not the code; it was your head. The question is not the cost. The question is the timeline.";
    const out = fixLoop(RULES, text, defaultProvider, { analyze: buildDocAnalysis });
    expect(out.text).toBe("The problem was your head. The question is the timeline.");
    expect(out.after.findings).toEqual([]);
  });
});

describe("reframe collapse — the shapes it declines", () => {
  // Both unhandled variants report a span that starts AND ends inside one unit; the fixer tells them
  // apart from the handled cross-unit shape that way. See the header of fixers/reframe.ts.
  it("returns null for the because-variant", () => {
    const text = "He left not because he was tired, but because he was bored.";
    const doc = buildDocAnalysis(text);
    const hits = reframeRule.detect(doc);
    expect(hits).toHaveLength(1);
    expect(reframeCollapse(hits[0]!, doc)).toBeNull();
    expect(reframeContrast(hits[0]!, doc)).toBeNull();
    expect(reframeProposals(hits[0]!, doc)).toEqual([]);
  });

  it("returns null when the finding's span does not reach a following unit", () => {
    const text = "The problem was not the code; it was your head.";
    const { doc, finding } = only(text);
    const shrunk: Finding = { ...finding, span: { start: finding.span.start, end: finding.span.start + 4 } };
    expect(reframeCollapse(shrunk, doc)).toBeNull();
  });

  it("returns null when the units carry no clauses to check the shape against", () => {
    const text = "The problem was not the code; it was your head.";
    const { doc, finding } = only(text);
    const bare: DocAnalysis = {
      ...doc,
      units: doc.units.map(({ clauses: _dropped, ...rest }) => ({ ...rest, outcome: "fragment" as const })),
    };
    expect(reframeCollapse(finding, bare)).toBeNull();
  });
});

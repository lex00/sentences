// An end-to-end exercise of the exact call sequence main.ts wires up — buildDocAnalysis ->
// runRules -> buildReport, toggle filtering, segmentSpans over real findings, and
// fixLoop + computeFixDiff — run headlessly, with no DOM and no model. This is the part of the
// app that vitest CAN prove without a browser; the browser-only pieces (DOM rendering, the
// lazy-loaded neural pass) were verified by hand against the dev server — see the PR/report.

import { describe, it, expect } from "vitest";
import { buildDocAnalysis } from "../lint/build-doc.js";
import { runRules } from "../lint/engine.js";
import { buildReport } from "../lint/report.js";
import { RULES, enabledRules } from "../lint/registry.js";
import { fixLoop, defaultProvider } from "../lint/fix/index.js";
import { segmentSpans } from "./highlight.js";
import { computeFixDiff } from "./diff.js";

const SLOP =
  "Let's delve into the rich tapestry of this remarkable, robust paradigm. " +
  "It's not a bug — it's a feature. The result? Devastating.";

describe("destink pipeline: rule-based fast pass (no model, no download)", () => {
  it("produces located, in-bounds findings and a nonzero score from a slop paragraph", () => {
    const rules = enabledRules({}, RULES);
    const doc = buildDocAnalysis(SLOP);
    const { findings, errors } = runRules(rules, doc);
    expect(errors).toEqual([]);
    expect(findings.length).toBeGreaterThan(0);

    const report = buildReport(SLOP, findings, errors, rules);
    expect(report.score.total).toBeGreaterThan(0);
    expect(report.wordCount).toBeGreaterThan(0);

    for (const f of findings) {
      expect(f.span.start).toBeGreaterThanOrEqual(0);
      expect(f.span.end).toBeLessThanOrEqual(SLOP.length);
      expect(f.span.end).toBeGreaterThan(f.span.start);
    }
    // known trope words in this paragraph are actually caught
    expect(findings.some((f) => f.ruleId === "lex-delve-family")).toBe(true);
  });

  it("segmentSpans tiles the whole document with no gaps or overlaps, from real findings", () => {
    const rules = enabledRules({}, RULES);
    const doc = buildDocAnalysis(SLOP);
    const { findings } = runRules(rules, doc);
    const segs = segmentSpans(SLOP.length, findings.map((f) => f.span));
    expect(segs[0]!.start).toBe(0);
    expect(segs[segs.length - 1]!.end).toBe(SLOP.length);
    for (let i = 1; i < segs.length; i++) expect(segs[i]!.start).toBe(segs[i - 1]!.end);
  });

  it("turning a rule off (the toggles panel's effect) removes exactly that rule's findings", () => {
    const doc = buildDocAnalysis(SLOP);
    const before = runRules(enabledRules({}, RULES), doc).findings;
    const withoutDelve = enabledRules({ "lex-delve-family": false }, RULES);
    const after = runRules(withoutDelve, doc).findings;
    expect(after.length).toBeLessThan(before.length);
    expect(after.some((f) => f.ruleId === "lex-delve-family")).toBe(false);
  });
});

describe("destink pipeline: apply mechanical fixes (fixLoop + computeFixDiff)", () => {
  it("removes filler intensifiers and yields a before/after diff over the actual edits", () => {
    const text = "This is a very, really quite good idea.";
    const rules = enabledRules({}, RULES);
    const result = fixLoop(rules, text, defaultProvider, { analyze: buildDocAnalysis });

    expect(result.applied.length).toBeGreaterThan(0);
    expect(result.after.findings.length).toBeLessThan(result.before.findings.length);
    expect(result.text.toLowerCase()).not.toContain("very");

    const diff = computeFixDiff(text, result.steps);
    expect(diff.removed.length).toBeGreaterThan(0);
    for (const r of diff.removed) {
      expect(r.start).toBeGreaterThanOrEqual(0);
      expect(r.end).toBeLessThanOrEqual(text.length);
      expect(r.end).toBeGreaterThan(r.start);
    }
    for (const r of diff.added) {
      expect(r.start).toBeGreaterThanOrEqual(0);
      expect(r.end).toBeLessThanOrEqual(result.text.length);
    }
  });

  it("a document the demo fixer can't touch reports zero applied fixes and an empty diff", () => {
    const text = "The dog chased the ball across the yard.";
    const rules = enabledRules({}, RULES);
    const result = fixLoop(rules, text, defaultProvider, { analyze: buildDocAnalysis });
    expect(result.applied.length).toBe(0);
    expect(result.text).toBe(text);
    expect(computeFixDiff(text, result.steps)).toEqual({ removed: [], added: [] });
  });
});

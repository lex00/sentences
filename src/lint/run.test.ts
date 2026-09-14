import { describe, it, expect } from "vitest";
import { lintDocument } from "./run.js";
import { RULES, enabledRules } from "./registry.js";
import { runRules } from "./engine.js";
import { buildReport } from "./report.js";
import { buildDocAnalysis } from "./build-doc.js";
import { extractProse } from "./markdown-prose.js";
import { demoIntensifierRule } from "./rules/demo.js";

const SLOP = "It's not a bug. It's a feature. Let's delve into the details of this robust framework.";

describe("lintDocument", () => {
  it("matches the four-step pipeline it replaces", () => {
    const rules = enabledRules({}, RULES);
    const { findings, errors } = runRules(rules, buildDocAnalysis(SLOP));
    expect(lintDocument(SLOP)).toEqual(buildReport(SLOP, findings, errors, rules));
  });

  it("is deterministic — two runs over the same input are byte-identical", () => {
    expect(JSON.stringify(lintDocument(SLOP))).toBe(JSON.stringify(lintDocument(SLOP)));
  });

  it("returns a well-formed report for empty input", () => {
    const report = lintDocument("");
    expect(report.version).toBe(1);
    expect(report.wordCount).toBe(0);
    expect(report.findings).toEqual([]);
    expect(report.score.total).toBe(0);
  });

  describe("markdown", () => {
    // A fenced block is code, not prose. Off, its contents get linted like sentences; on, they are
    // blanked before the rules see them.
    const md = ["Some ordinary prose here.", "", "```js", "// Let's delve into the details.", "```"].join("\n");

    it("lints markdown structure as prose when off", () => {
      expect(lintDocument(md).counts.byRule["lex-delve-family"]).toBe(1);
    });

    it("blanks it when on", () => {
      expect(lintDocument(md, { markdown: true }).counts.byRule["lex-delve-family"]).toBeUndefined();
    });

    it("builds the report from the ORIGINAL text, so spans and word count still index the file", () => {
      const report = lintDocument(md, { markdown: true });
      expect(report.wordCount).toBe(lintDocument(md).wordCount);
      // extractProse preserves length; that is what keeps every span meaningful against `md`.
      expect(extractProse(md)).toHaveLength(md.length);
    });

    it("locates a finding in the original text even with the prose extracted", () => {
      const withCode = ["```js", "const x = 1;", "```", "", "It's worth noting that this is robust."].join("\n");
      const report = lintDocument(withCode, { markdown: true });
      expect(report.findings.length).toBeGreaterThan(0);
      const f = report.findings[0]!;
      expect(withCode.slice(f.span.start, f.span.end)).toBe("It's worth noting");
    });
  });

  describe("rule selection", () => {
    it("skips a rule toggled off, and drops it from the score", () => {
      const on = lintDocument(SLOP);
      const off = lintDocument(SLOP, { toggles: { "lex-delve-family": false } });
      expect(on.counts.byRule["lex-delve-family"]).toBeGreaterThan(0);
      expect(off.counts.byRule["lex-delve-family"]).toBeUndefined();
      expect(off.score.total).toBeLessThan(on.score.total);
    });

    it("runs only the rules given, when a subset is passed", () => {
      const text = "This is a very good idea. It is really quite clever.";
      const report = lintDocument(text, { rules: [demoIntensifierRule] });
      expect(Object.keys(report.counts.byRule)).toEqual([demoIntensifierRule.id]);
    });

    it("toggles filter the subset, not the full registry", () => {
      const text = "This is a very good idea.";
      const report = lintDocument(text, {
        rules: [demoIntensifierRule],
        toggles: { [demoIntensifierRule.id]: false },
      });
      expect(report.findings).toEqual([]);
    });
  });
});

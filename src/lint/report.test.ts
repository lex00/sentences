import { describe, it, expect } from "vitest";
import { buildReport } from "./report.js";
import { runRules } from "./engine.js";
import { makeDoc } from "./stub-doc.js";
import { demoIntensifierRule } from "./rules/demo.js";
import type { TropeRule } from "./types.js";

const RULES: readonly TropeRule[] = [demoIntensifierRule];

describe("buildReport", () => {
  const text = "This is a very good idea. It is really quite clever.";

  it("has the documented top-level shape and schema version", () => {
    const { findings, errors } = runRules(RULES, makeDoc(text));
    const report = buildReport(text, findings, errors, RULES);
    expect(report.version).toBe(1);
    expect(Object.keys(report)).toEqual(["version", "wordCount", "score", "counts", "findings", "errors"]);
    expect(report.wordCount).toBe(11);
    expect(report.errors).toEqual([]);
  });

  it("attaches each finding's tier from the rule set, in engine order", () => {
    const { findings, errors } = runRules(RULES, makeDoc(text));
    const report = buildReport(text, findings, errors, RULES);
    expect(report.findings).toHaveLength(3);
    for (const f of report.findings) {
      expect(f.tier).toBe("lexical");
      expect(f.ruleId).toBe("demo/intensifier");
      expect(typeof f.span.start).toBe("number");
      expect(typeof f.span.end).toBe("number");
    }
    // document order, same as the underlying findings
    expect(report.findings.map((f) => f.span.start)).toEqual(findings.map((f) => f.span.start));
  });

  it("tier is null for a finding whose ruleId isn't in the supplied rule set", () => {
    const stray: TropeRule = {
      id: "stray/rule",
      name: "stray",
      tier: "discourse",
      detect: () => [{ ruleId: "stray/rule", span: { start: 0, end: 4 }, severity: "low", message: "m", explanation: "e" }],
    };
    const { findings, errors } = runRules([stray], makeDoc(text));
    // Build the report against a DIFFERENT rule set that doesn't know about "stray/rule".
    const report = buildReport(text, findings, errors, []);
    expect(report.findings[0]!.tier).toBeNull();
    expect(report.counts.byTier.discourse).toBe(0); // not counted anywhere, since tier is unknown
  });

  it("counts findings by severity, by tier, and by rule, with zeroed buckets present", () => {
    const { findings, errors } = runRules(RULES, makeDoc(text));
    const report = buildReport(text, findings, errors, RULES);
    expect(report.counts.findings).toBe(3);
    expect(report.counts.bySeverity).toEqual({ candidate: 0, low: 0, medium: 3, high: 0 });
    expect(report.counts.byTier).toEqual({ lexical: 3, syntactic: 0, formatting: 0, discourse: 0 });
    expect(report.counts.byRule).toEqual({ "demo/intensifier": 3 });
  });

  it("records rule errors by id and message, dropping the raw thrown value", () => {
    const boom: TropeRule = {
      id: "boom/rule",
      name: "boom",
      tier: "lexical",
      detect: () => {
        throw new Error("kaboom");
      },
    };
    const { findings, errors } = runRules([boom], makeDoc(text));
    const report = buildReport(text, findings, errors, [boom]);
    expect(report.errors).toEqual([{ ruleId: "boom/rule", message: "rule threw: kaboom" }]);
  });

  it("is deterministic: same input, byte-identical report, every run", () => {
    const { findings, errors } = runRules(RULES, makeDoc(text));
    const reports = [
      buildReport(text, findings, errors, RULES),
      buildReport(text, findings, errors, RULES),
      buildReport(text, runRules(RULES, makeDoc(text)).findings, runRules(RULES, makeDoc(text)).errors, RULES),
    ];
    const serialized = reports.map((r) => JSON.stringify(r));
    expect(serialized[1]).toBe(serialized[0]);
    expect(serialized[2]).toBe(serialized[0]);
  });

  it("never includes a timestamp, absolute path, or other non-deterministic field", () => {
    const { findings, errors } = runRules(RULES, makeDoc(text));
    const report = buildReport(text, findings, errors, RULES);
    const serialized = JSON.stringify(report);
    expect(serialized).not.toMatch(/\d{4}-\d{2}-\d{2}T/); // no ISO timestamp
    expect(serialized).not.toContain(process.cwd());
  });
});

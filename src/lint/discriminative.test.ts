import { describe, it, expect } from "vitest";
import { DISCRIMINATIVE_RULES, isDiscriminative } from "./discriminative.js";
import { RULES } from "./registry.js";
import { lintDocument } from "./run.js";
import { scoreFindings, SEVERITY_WEIGHT } from "./score.js";

describe("the discriminative rule list", () => {
  it("names only rules that exist", () => {
    const known = new Set(RULES.map((r) => r.id));
    const unknown = [...DISCRIMINATIVE_RULES].filter((id) => !known.has(id));
    expect(unknown, `not in the registry: ${unknown.join(", ")}`).toEqual([]);
  });

  it("excludes the demo rule, which is marked for deletion", () => {
    expect(isDiscriminative("demo/intensifier")).toBe(false);
  });

  // The whole point of the second number: these carry the bulk of score.total on both a generated
  // and a hand-written document, so counting them would collapse the separation again.
  it("excludes the rules measured at or below parity with hand-written prose", () => {
    for (const id of [
      "formatting/em-dash-density",
      "claude/colon-reveal",
      "tricolon/comma-series",
      "claude/contrast-tail",
      "lex-delve-family",
    ]) {
      expect(isDiscriminative(id), `${id} should not count`).toBe(false);
    }
  });

  it("is a strict subset of the rule set", () => {
    expect(DISCRIMINATIVE_RULES.size).toBeLessThan(RULES.length);
    expect(DISCRIMINATIVE_RULES.size).toBeGreaterThan(0);
  });
});

describe("score.discriminative", () => {
  const tier = () => "discourse" as const;

  it("counts only the listed rules", () => {
    const f = (ruleId: string) => ({ ruleId, span: { start: 0, end: 1 }, severity: "low" as const, message: "", explanation: "" });
    const both = scoreFindings([f("reframe"), f("formatting/em-dash-density")], 1000, tier);
    expect(both.total).toBe(SEVERITY_WEIGHT.low * 2);
    expect(both.discriminative).toBe(SEVERITY_WEIGHT.low);
  });

  it("is zero when nothing discriminating fired", () => {
    const only = scoreFindings(
      [{ ruleId: "formatting/em-dash-density", span: { start: 0, end: 1 }, severity: "high", message: "", explanation: "" }],
      1000,
      tier,
    );
    expect(only.total).toBeGreaterThan(0);
    expect(only.discriminative).toBe(0);
  });

  it("never exceeds the total", () => {
    for (const text of ["", "It is not bold. It is backwards.", "A plain sentence about nothing much."]) {
      const s = lintDocument(text).score;
      expect(s.discriminative).toBeLessThanOrEqual(s.total);
    }
  });

  it("uses the same severity weights as the total", () => {
    const f = (severity: "low" | "high") => ({ ruleId: "reframe", span: { start: 0, end: 1 }, severity, message: "", explanation: "" });
    expect(scoreFindings([f("high")], 1000, tier).discriminative).toBe(SEVERITY_WEIGHT.high);
    expect(scoreFindings([f("low")], 1000, tier).discriminative).toBe(SEVERITY_WEIGHT.low);
  });

  it("sits between total and byTier in the report, so key order is stable", () => {
    expect(Object.keys(lintDocument("A sentence.").score)).toEqual(["total", "discriminative", "byTier", "byRule"]);
  });
});

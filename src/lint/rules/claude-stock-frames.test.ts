// Severity behavior for claude-stock-frames (issue #34): single-hit fires visibly at the lexicon's
// defaultSeverity (low), density only ESCALATES to medium, and pinned entries (the broetry closers)
// stay put in both directions. The fixture battery (fixtures/claude-stock-frames.ts) already pins
// span-matching; this file asserts the severity numbers and the motivating-sample finding count.
import { describe, it, expect } from "vitest";
import { makeDoc } from "../stub-doc.js";
import { RULES } from "../registry.js";
import { claudeStockFramesRule } from "./claude-stock-frames.js";

describe("claude-stock-frames: single-hit severity, no step-down", () => {
  it("a lone hit fires at the lexicon's defaultSeverity (low), not demoted to candidate", () => {
    const doc = makeDoc("This tool isn't slowing down anytime soon.");
    const findings = claudeStockFramesRule.detect(doc);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe("low");
  });

  it("pins the broetry closers at medium regardless of density", () => {
    const doc = makeDoc("Let that sink in.");
    const findings = claudeStockFramesRule.detect(doc);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe("medium");
  });
});

describe("claude-stock-frames: escalation-only density (threshold 3)", () => {
  it("does not escalate below the threshold", () => {
    const doc = makeDoc("This is from day one. It happened after the fact.");
    const findings = claudeStockFramesRule.detect(doc);
    expect(findings).toHaveLength(2);
    expect(findings.every((f) => f.severity === "low")).toBe(true);
  });

  it("steps every default-severity hit up one level once total hits reach the threshold", () => {
    const doc = makeDoc(
      "This was baked into the process from day one. It came out after the fact. Full stop.",
    );
    const findings = claudeStockFramesRule.detect(doc);
    // 3 default-severity (low) hits: baked into, from day one, after the fact. ("Full stop" is a
    // 4th, also default-severity, so it escalates too.)
    expect(findings).toHaveLength(4);
    expect(findings.every((f) => f.severity === "medium")).toBe(true);
  });

  it("never escalates a pinned medium-tier (broetry closer) entry past medium", () => {
    const doc = makeDoc(
      "This is from day one, and it happened after the fact, full stop. Let that sink in.",
    );
    const findings = claudeStockFramesRule.detect(doc);
    expect(findings.length).toBeGreaterThanOrEqual(4);
    expect(findings.every((f) => f.severity === "medium")).toBe(true);
  });
});

describe("claude-stock-frames: the motivating sample", () => {
  it("fires exactly 3 findings on the reworded LinkedIn-style sample", () => {
    const doc = makeDoc("AI adoption isn't slowing down, and teams can't afford to stay on the sidelines.");
    const findings = claudeStockFramesRule.detect(doc);
    expect(findings).toHaveLength(3);
    const texts = findings
      .map((f) => doc.text.slice(f.span.start, f.span.end))
      .sort();
    expect(texts).toEqual(["can't afford to", "isn't slowing down", "stay on the sidelines"].sort());
  });
});

describe("claude-stock-frames: rule shape and registration", () => {
  it("reports tier 'lexical' and id 'claude-stock-frames'", () => {
    expect(claudeStockFramesRule.tier).toBe("lexical");
    expect(claudeStockFramesRule.id).toBe("claude-stock-frames");
  });

  it("gives every finding a non-empty explanation", () => {
    const doc = makeDoc("This tool isn't slowing down anytime soon.");
    for (const f of claudeStockFramesRule.detect(doc)) expect(f.explanation.length).toBeGreaterThan(0);
  });

  it("is wired into the app-wide registry", () => {
    expect(RULES.some((r) => r.id === "claude-stock-frames")).toBe(true);
  });
});

// Tests for rules/claude-lexicon.ts: the single-hit-fires, escalation-only severity semantics
// (opposite of lexical.ts's step-down), pinned overrides, and the concrete claudeTechnicalVocabulary
// rule built from it (issue #34). Fixture-battery.test.ts covers span correctness per entry; this
// file pins the severity arithmetic the fixture battery doesn't check.

import { describe, it, expect } from "vitest";
import { makeDoc } from "../stub-doc.js";
import { RULES } from "../registry.js";
import { claudeTechnicalVocabularyRule } from "./claude-lexicon.js";

describe("claudeTechnicalVocabularyRule: single-hit visibility", () => {
  it("fires at full (medium) severity on a single default-severity hit — no step-down", () => {
    const doc = makeDoc("This queue is battle-tested at scale.");
    const findings = claudeTechnicalVocabularyRule.detect(doc);
    expect(findings).toHaveLength(1);
    expect(doc.text.slice(findings[0]!.span.start, findings[0]!.span.end)).toBe("battle-tested");
    expect(findings[0]!.severity).toBe("medium");
  });

  it("fires at full (low) severity on a single low-tier hit — pinned, no step-down either", () => {
    const doc = makeDoc("These guardrails stop accidental deletes.");
    const findings = claudeTechnicalVocabularyRule.detect(doc);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe("low");
  });

  it("fires at high severity on a single high-tier hit — pinned", () => {
    const doc = makeDoc("It's worth stating plainly that this migration breaks the API.");
    const findings = claudeTechnicalVocabularyRule.detect(doc);
    expect(findings).toHaveLength(1);
    expect(doc.text.slice(findings[0]!.span.start, findings[0]!.span.end)).toBe("worth stating plainly");
    expect(findings[0]!.severity).toBe("high");
  });
});

describe("claudeTechnicalVocabularyRule: escalation-only density (threshold 4)", () => {
  it("does not escalate below the threshold", () => {
    const doc = makeDoc("This is battle-tested, but it's also a footgun with an escape hatch.");
    const findings = claudeTechnicalVocabularyRule.detect(doc);
    // 3 default-severity (medium) hits: battle-tested, footgun, escape hatch.
    expect(findings).toHaveLength(3);
    expect(findings.every((f) => f.severity === "medium")).toBe(true);
  });

  it("steps every default-severity hit up one level once total hits reach the threshold", () => {
    const doc = makeDoc(
      "This is battle-tested, but it's also a footgun with an escape hatch on the happy path.",
    );
    const findings = claudeTechnicalVocabularyRule.detect(doc);
    // 4 default-severity (medium) hits: battle-tested, footgun, escape hatch, happy path.
    expect(findings).toHaveLength(4);
    expect(findings.every((f) => f.severity === "high")).toBe(true);
  });

  it("never escalates a pinned low-tier entry past low, even at density", () => {
    const doc = makeDoc(
      "Seamless, idiomatic, opinionated, pragmatic: guardrails everywhere and still ergonomic.",
    );
    const findings = claudeTechnicalVocabularyRule.detect(doc);
    expect(findings.length).toBeGreaterThanOrEqual(4);
    expect(findings.every((f) => f.severity === "low")).toBe(true);
  });

  it("never escalates a pinned high-tier entry — already at the ceiling", () => {
    const doc = makeDoc(
      "Worth stating plainly: this is battle-tested, a footgun, an escape hatch, and the happy path.",
    );
    const findings = claudeTechnicalVocabularyRule.detect(doc);
    const high = findings.find((f) => doc.text.slice(f.span.start, f.span.end) === "Worth stating plainly");
    expect(high?.severity).toBe("high");
  });
});

describe("claudeTechnicalVocabularyRule: rule shape and registration", () => {
  it("reports tier 'lexical' and id 'claude-technical-vocabulary'", () => {
    expect(claudeTechnicalVocabularyRule.tier).toBe("lexical");
    expect(claudeTechnicalVocabularyRule.id).toBe("claude-technical-vocabulary");
  });

  it("gives every finding a non-empty explanation", () => {
    const doc = makeDoc("This is battle-tested, but it's also a footgun with an escape hatch.");
    for (const f of claudeTechnicalVocabularyRule.detect(doc)) expect(f.explanation.length).toBeGreaterThan(0);
  });

  it("is wired into the app-wide registry", () => {
    expect(RULES.some((r) => r.id === "claude-technical-vocabulary")).toBe(true);
  });

  it("does not include 'load-bearing' — that gate lives in claude-figurative.ts", () => {
    const doc = makeDoc("That helper function is load-bearing for the whole pipeline.");
    const findings = claudeTechnicalVocabularyRule.detect(doc);
    expect(findings).toHaveLength(0);
  });
});

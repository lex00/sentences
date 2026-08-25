// Severity behavior for claude-assistant-voice (issue #34): single-hit fires visibly at its
// declared severity, and density only ESCALATES — never a step-down, unlike the generic lexical
// tier (rules/lexical.ts's stepDown). The fixture battery (fixtures/claude-assistant-voice.ts)
// already pins span-matching; this file is what actually asserts the severity numbers, since the
// battery only checks spans.
import { describe, it, expect } from "vitest";
import { makeDoc } from "../stub-doc.js";
import { claudeAssistantVoiceRule } from "./claude-assistant-voice.js";

describe("claude-assistant-voice: single-hit severity, no step-down", () => {
  it("a lone pinned-high hit fires at high, below the lexicon's densityThreshold", () => {
    const doc = makeDoc("You're absolutely right about the deploy window.");
    const findings = claudeAssistantVoiceRule.detect(doc);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe("high");
  });

  it("a lone default-severity hit fires at the lexicon's defaultSeverity (medium), not demoted", () => {
    const doc = makeDoc("Great question about the migration timeline.");
    const findings = claudeAssistantVoiceRule.detect(doc);
    expect(findings).toHaveLength(1);
    // Contrast: the generic lexical tier (lexical.ts) would step a below-threshold hit like this
    // DOWN to "low". This tier never does — one hit is already the tell.
    expect(findings[0]!.severity).toBe("medium");
  });

  it("a lone pinned-low hit (production-ready) fires at low, not demoted further", () => {
    const doc = makeDoc("The auth service is production-ready after this patch.");
    const findings = claudeAssistantVoiceRule.detect(doc);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe("low");
  });
});

describe("claude-assistant-voice: density escalates, never steps down", () => {
  it("steps every default-severity hit UP one level once the document reaches densityThreshold (3)", () => {
    const doc = makeDoc(
      "Great question about the rollout. Happy to elaborate on the rollback plan. Feel free to ping me after.",
    );
    const findings = claudeAssistantVoiceRule.detect(doc);
    expect(findings).toHaveLength(3);
    expect(findings.every((f) => f.severity === "high")).toBe(true);
  });

  it("leaves a pinned entry's severity untouched by escalation even when the lexicon overall escalates", () => {
    const doc = makeDoc(
      "The build is production-ready. Great question about the rollout. Happy to elaborate on it. Feel free to ping me.",
    );
    const findings = claudeAssistantVoiceRule.detect(doc);
    expect(findings).toHaveLength(4);
    const byText = new Map(findings.map((f) => [doc.text.slice(f.span.start, f.span.end).toLowerCase(), f.severity]));
    // Pinned low stays low even though the lexicon's total hit count (4) is over densityThreshold.
    expect(byText.get("production-ready")).toBe("low");
    // The three default-severity hits step up from medium to high.
    expect(byText.get("great question")).toBe("high");
    expect(byText.get("happy to elaborate")).toBe("high");
    expect(byText.get("feel free to")).toBe("high");
  });
});

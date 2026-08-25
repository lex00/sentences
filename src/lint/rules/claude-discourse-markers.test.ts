// Severity behavior for claude-discourse-markers (issue #34): single-hit fires visibly at the
// lexicon's defaultSeverity (low), and density only ESCALATES it to medium — never a step-down.
// The fixture battery (fixtures/claude-discourse-markers.ts) already pins span-matching; this file
// asserts the severity numbers, since the battery only checks spans.
import { describe, it, expect } from "vitest";
import { makeDoc } from "../stub-doc.js";
import { claudeDiscourseMarkersRule } from "./claude-discourse-markers.js";

describe("claude-discourse-markers: single-hit severity, no step-down", () => {
  it("a lone hit fires at the lexicon's defaultSeverity (low), not demoted to candidate", () => {
    const doc = makeDoc("The key insight is that retries mask the real failure.");
    const findings = claudeDiscourseMarkersRule.detect(doc);
    expect(findings).toHaveLength(1);
    // Contrast: the generic lexical tier (lexical.ts) would step a below-threshold "low" hit down
    // to "candidate". This tier never does.
    expect(findings[0]!.severity).toBe("low");
  });

  it("fires even when the phrase is being discussed rather than used as a live transition", () => {
    const doc = makeDoc("The paper calls this hedging: in other words, a phrase that softens a claim.");
    const findings = claudeDiscourseMarkersRule.detect(doc);
    expect(findings).toHaveLength(1);
    expect(doc.text.slice(findings[0]!.span.start, findings[0]!.span.end)).toBe("in other words");
  });
});

describe("claude-discourse-markers: density escalates, never steps down", () => {
  it("steps every hit UP one level once the document reaches densityThreshold (3)", () => {
    const doc = makeDoc(
      "The key insight is that retries mask the real failure. Net-net, the caching layer paid for " +
        "itself. This edge case is worth flagging before the release.",
    );
    const findings = claudeDiscourseMarkersRule.detect(doc);
    expect(findings).toHaveLength(3);
    expect(findings.every((f) => f.severity === "medium")).toBe(true);
  });
});

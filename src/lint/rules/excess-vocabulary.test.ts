// Severity behavior for excess-vocabulary (issue #34): the STANDARD tier's density step-down (the
// opposite direction from the claude-lexicon.ts tier) — see rules/standard-lexicon.ts's header.
// The fixture battery (fixtures/excess-vocabulary.ts) already pins span-matching; this file asserts
// the severity numbers, since the battery only checks spans.
import { describe, it, expect } from "vitest";
import { makeDoc } from "../stub-doc.js";
import { excessVocabularyRule } from "./excess-vocabulary.js";

describe("excess-vocabulary: medium band is pinned", () => {
  it("fires at medium regardless of document density", () => {
    const doc = makeDoc("The report keeps showcasing the same three metrics every quarter.");
    const findings = excessVocabularyRule.detect(doc);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe("medium");
  });
});

describe("excess-vocabulary: low band is pinned", () => {
  it("a lone low-band hit fires at low, not demoted to candidate", () => {
    const doc = makeDoc("This was a pivotal moment for the whole team.");
    const findings = excessVocabularyRule.detect(doc);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe("low");
  });
});

describe("excess-vocabulary: candidate band steps down below density, not above it", () => {
  it("a lone candidate-band hit (no severity override) steps down from the low default", () => {
    const doc = makeDoc("This step is crucial for the migration to succeed.");
    const findings = excessVocabularyRule.detect(doc);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe("candidate");
  });

  it("once density reaches the threshold (3), the same words score at the low default", () => {
    const doc = makeDoc(
      "This step is crucial for the migration. The findings were comprehensive, and the " +
        "insights from the retro were worth writing down.",
    );
    const findings = excessVocabularyRule.detect(doc);
    // "crucial", "comprehensive", "insights" — three candidate-band hits, no other lexicon words.
    expect(findings).toHaveLength(3);
    expect(findings.every((f) => f.severity === "low")).toBe(true);
  });
});

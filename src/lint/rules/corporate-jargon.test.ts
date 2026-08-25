// Severity behavior for corporate-jargon (issue #34): no densityThreshold is set on this lexicon
// (see lexicons/corporate-jargon.ts's header — every entry is a distinctive multi-word phrase), so
// the standard tier's density step-down never applies here: a single hit fires at the lexicon's
// defaultSeverity (medium) outright.
import { describe, it, expect } from "vitest";
import { makeDoc } from "../stub-doc.js";
import { corporateJargonRule } from "./corporate-jargon.js";

describe("corporate-jargon: no density gate, single hit fires at defaultSeverity", () => {
  it("a lone hit fires at medium", () => {
    const doc = makeDoc("We need to move the needle before the board meeting.");
    const findings = corporateJargonRule.detect(doc);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe("medium");
  });

  it("many hits still fire at medium each — no escalation, no step-down", () => {
    const doc = makeDoc(
      "Let's take this offline. We need to move the needle. That's classic low-hanging fruit, " +
        "so let's do a deep dive before we double down.",
    );
    const findings = corporateJargonRule.detect(doc);
    expect(findings.length).toBeGreaterThanOrEqual(4);
    expect(findings.every((f) => f.severity === "medium")).toBe(true);
  });
});

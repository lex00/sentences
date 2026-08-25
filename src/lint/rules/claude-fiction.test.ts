// Severity assertions for the claude-isms fiction rules (issue #34) that the fixture battery can't
// express — RuleFixtures only checks fire/silence (fixtures/claude-fiction-frames.ts,
// fixtures/claude-fiction-gestures.ts cover that half). This file pins the single-hit-fires,
// escalation-only severity model from claude-lexicon.ts against these two specific lexicons:
// densityThreshold 3 / defaultSeverity "medium" for frames, densityThreshold 5 / "candidate" for
// gestures — including the two precision calls the lexicon file documents (a single common gesture
// verb stays visible, not silent; a literal-sense "obsidian" still fires, at the weakest severity).
import { describe, it, expect } from "vitest";
import { makeDoc } from "../stub-doc.js";
import { claudeFictionFramesRule, claudeFictionGesturesRule } from "./claude-fiction.js";

describe("claudeFictionFramesRule severity", () => {
  it("fires a single hit at the lexicon's default severity (medium) — no density floor to clear", () => {
    const doc = makeDoc("Her reply came barely above a whisper.");
    const findings = claudeFictionFramesRule.detect(doc);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe("medium");
  });

  it("escalates every hit to high once the document reaches densityThreshold(3)", () => {
    const doc = makeDoc(
      "It was something else entirely. Little did she know how wrong she was. " +
        "The wait dragged on for what seemed like an eternity.",
    );
    const findings = claudeFictionFramesRule.detect(doc);
    expect(findings.length).toBeGreaterThanOrEqual(3);
    for (const f of findings) expect(f.severity).toBe("high");
  });

  it("stays at medium with only two hits in the document (below densityThreshold(3))", () => {
    const doc = makeDoc("It was something else entirely. His knuckles whitened around the railing.");
    const findings = claudeFictionFramesRule.detect(doc);
    expect(findings).toHaveLength(2);
    for (const f of findings) expect(f.severity).toBe("medium");
  });
});

describe("claudeFictionGesturesRule severity", () => {
  it("fires a single common gesture verb in an otherwise plain paragraph — visible, not silent", () => {
    const doc = makeDoc("He picked up the box, carried it to the car, and drove to the store.");
    // No gesture-cluster word in that sentence on purpose — assert the *other* half of the
    // single-hit-fires model with a sentence that does carry exactly one.
    const withOneVerb = makeDoc("He picked up the box and blinked at the price tag before paying.");
    expect(claudeFictionGesturesRule.detect(doc)).toHaveLength(0);
    const findings = claudeFictionGesturesRule.detect(withOneVerb);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe("candidate");
  });

  it("fires obsidian's literal-rock sense too, pinned at candidate (single hit, no escalation)", () => {
    const doc = makeDoc("The cave walls were lined with obsidian.");
    const findings = claudeFictionGesturesRule.detect(doc);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe("candidate");
  });

  it("escalates candidate to low once the document reaches densityThreshold(5)", () => {
    const doc = makeDoc(
      "He leaned back and blinked. She murmured something and glanced away. " +
        "He tilted his head, and his hands trembled faintly.",
    );
    const findings = claudeFictionGesturesRule.detect(doc);
    expect(findings.length).toBeGreaterThanOrEqual(5);
    for (const f of findings) expect(f.severity).toBe("low");
  });

  it("stays at candidate with only two hits (below densityThreshold(5))", () => {
    const doc = makeDoc("She nodded once and then glanced at the door.");
    const findings = claudeFictionGesturesRule.detect(doc);
    expect(findings).toHaveLength(2);
    for (const f of findings) expect(f.severity).toBe("candidate");
  });
});

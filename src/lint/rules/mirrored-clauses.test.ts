import { describe, it, expect } from "vitest";
import { runRules } from "../engine.js";
import { buildDocAnalysis } from "../build-doc.js";
import { makeDoc, spanOf } from "../stub-doc.js";
import { reframeRule } from "./reframe.js";
import { anaphoraRule } from "./anaphora.js";
import { mirroredClausesRule } from "./mirrored-clauses.js";

const run = (text: string) => runRules([mirroredClausesRule], buildDocAnalysis(text)).findings;

describe("claude/mirrored-clauses", () => {
  it("fires on the flagship semicolon mirror, spanning both halves", () => {
    const text = "Products impress people; platforms empower them.";
    const findings = run(text);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.ruleId).toBe("claude/mirrored-clauses");
    expect(findings[0]!.span).toEqual(spanOf(text, "Products impress people; platforms empower them"));
    expect(findings[0]!.message).toContain("subject-verb-object");
  });

  it("fires across a sentence boundary when the verb is echoed rather than swapped", () => {
    const text = "Engineers write code. Managers write memos.";
    const findings = run(text);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.span).toEqual(spanOf(text, "Engineers write code. Managers write memos"));
  });

  it("fires on the copular variant", () => {
    const text = "Products are engines. Platforms are vehicles.";
    const findings = run(text);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toContain("copular");
  });

  it("a single pair is only a candidate; two are low, three medium", () => {
    const one = "Products impress people; platforms empower them.";
    const two = `${one} Engineers write code. Managers write memos.`;
    const three = `${two} Products are engines. Platforms are vehicles.`;
    expect(run(one).map((f) => f.severity)).toEqual(["candidate"]);
    expect(new Set(run(two).map((f) => f.severity))).toEqual(new Set(["low"]));
    expect(new Set(run(three).map((f) => f.severity))).toEqual(new Set(["medium"]));
  });

  // --- the seams with the neighbouring rules ---

  it("leaves negated pairs to reframe: both clauses must be affirmative", () => {
    expect(run("Products are not tools. Platforms are worlds.")).toEqual([]);
  });

  it("leaves same-subject repeats to anaphora: the two subjects must differ", () => {
    expect(run("Platforms empower people. Platforms create worlds.")).toEqual([]);
  });

  it("does not fire on reframe's own positives", () => {
    const texts = [
      "This is not a rant. This is a diagnosis.",
      "The problem was not the code; it was your head.",
      "It's obviously not the bold plan for this year's big project. It's actually the safer plan for the team.",
    ];
    for (const t of texts) expect(run(t), t).toEqual([]);
  });

  it("does not fire on anaphora's own positive", () => {
    expect(run("They assume users will pay. They assume developers will build. They assume ecosystems will emerge.")).toEqual([]);
  });

  it("and neither reframe nor anaphora fires on this rule's flagship", () => {
    const doc = buildDocAnalysis("Products impress people; platforms empower them.");
    expect(runRules([reframeRule, anaphoraRule], doc).findings).toEqual([]);
  });

  // --- precision ---

  it("stays clean on ordinary prose with singular subjects", () => {
    expect(run("The dog chased the ball. A cat slept on the warm windowsill.")).toEqual([]);
  });

  it("stays clean when the two clauses share a complement — that is restatement, not a mirror", () => {
    expect(run("Products impress people. Platforms empower people.")).toEqual([]);
  });

  it("stays clean when the two halves are lopsided in length", () => {
    expect(
      run("Products impress people; platforms empower every single reader who ever opens the application at all."),
    ).toEqual([]);
  });

  // Both of these lower to a directObject clause with a plural subject and matching length; the PPs
  // are what stops them, folded by the chunker into the object's modifiers and the indirect-object
  // slot. Without the bare-frame requirement this is a false positive on plain prose.
  it("stays clean on prose the chunker parses into the same shape by accident", () => {
    expect(run("Birds gathered near a feeder by the fence. Markets closed early ahead of the holiday weekend.")).toEqual([]);
  });

  it("stays clean on mismatched skeletons", () => {
    expect(run("Engineers write code. Managers are tired.")).toEqual([]);
  });

  it("known limit: an intransitive mirror carries no skeleton to match and is not caught", () => {
    expect(run("Products scale linearly; platforms scale exponentially.")).toEqual([]);
  });

  it("reports nothing when no unit lowered", () => {
    expect(runRules([mirroredClausesRule], makeDoc("Products impress people; platforms empower them.")).findings).toEqual([]);
  });

  it("is deterministic", () => {
    const text = "Products impress people; platforms empower them. Engineers write code. Managers write memos.";
    expect(JSON.stringify(run(text))).toBe(JSON.stringify(run(text)));
  });
});

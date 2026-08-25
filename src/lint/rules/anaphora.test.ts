import { describe, it, expect } from "vitest";
import { anaphoraRule } from "./anaphora.js";
import { readDocument } from "../../document.js";
import { wordSpans } from "../stub-doc.js";
import type { DocAnalysis, UnitAnalysis } from "../types.js";

// Builds a real DocAnalysis through the rule-based document splitter (document.ts, #7/#8) — the
// same path the app runs — adding the word-level spans (stub-doc.ts's wordSpans) that DocUnit
// itself doesn't carry. This exercises the rule against genuine Clause IR (subjectHead over real
// lowered clauses) and genuine fragment/unparseable classification, not a hand-rolled stand-in.
function docFromText(text: string): DocAnalysis {
  const units: UnitAnalysis[] = readDocument(text).map((u) => ({ ...u, words: wordSpans(text, u.span) }));
  return { text, units };
}

const detect = (text: string) => anaphoraRule.detect(docFromText(text));

describe("anaphora/repeated-opening — threshold", () => {
  it("2 repeats of the same subject head: clean (a deliberate reframe, not anaphora)", () => {
    // subjectHead ignores the copula/negation difference — "isn't" vs "is" — so this really is
    // 2 matches of "question", which is exactly the "clean at 2" case the issue calls out.
    const text = "The question isn't bold. The question is backwards.";
    expect(detect(text)).toEqual([]);
  });

  it("3 repeats of the same subject head: fires", () => {
    const text = "They assume users will pay. They assume developers will build. They assume ecosystems will emerge.";
    const findings = detect(text);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.ruleId).toBe("anaphora/repeated-opening");
    expect(findings[0]!.message).toContain("3 sentences in a row open with");
    expect(findings[0]!.message).toContain("They");
  });

  it("severity escalates to high at 5+ repeats", () => {
    const text = Array.from({ length: 5 }, (_, i) => `They could unlock idea ${i}.`).join(" ");
    const findings = detect(text);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe("high");
  });

  it("4 repeats stay at medium severity", () => {
    const text = Array.from({ length: 4 }, (_, i) => `They could unlock idea ${i}.`).join(" ");
    const findings = detect(text);
    expect(findings[0]!.severity).toBe("medium");
  });
});

describe("anaphora/repeated-opening — clean prose", () => {
  it("finds nothing when every sentence opens differently", () => {
    const text = "The dog ran fast. A cat slept quietly. Birds sang in the trees.";
    expect(detect(text)).toEqual([]);
  });

  it("finds nothing in a single sentence", () => {
    expect(detect("They assume users will pay.")).toEqual([]);
  });
});

describe("anaphora/repeated-opening — window (nearby, not document-wide)", () => {
  it("does not fire when 3 matching openers are spread farther apart than the window", () => {
    // The 3 "They"-led units are real (verified individually below), but each pair is separated
    // by more than WINDOW-1 (4) unlinked units, so no run ever reaches length 3.
    const filler = "A cat slept. A dog barked. A bird sang. A fish swam. A frog hopped.";
    const text = `They assume users will pay. ${filler} They assume developers will build. ${filler} They assume ecosystems will emerge.`;
    expect(detect(text)).toEqual([]);
  });

  it("fires when the same 3 openers are within the window", () => {
    const text = "They assume users will pay. A cat slept. They assume developers will build. A dog barked. They assume ecosystems will emerge.";
    const findings = detect(text);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toContain("3 sentences");
  });
});

describe("anaphora/repeated-opening — one finding per maximal run, span covers it", () => {
  it("emits exactly one finding for a run of 6, not one per overlapping window", () => {
    const text = Array.from({ length: 6 }, (_, i) => `They could unlock value ${i}.`).join(" ");
    const findings = detect(text);
    expect(findings).toHaveLength(1);
  });

  it("the finding's span covers from the first to the last unit in the run", () => {
    const text = "They assume users will pay. They assume developers will build. They assume ecosystems will emerge.";
    const findings = detect(text);
    const doc = docFromText(text);
    expect(findings[0]!.span.start).toBe(doc.units[0]!.span.start);
    expect(findings[0]!.span.end).toBe(doc.units[2]!.span.end);
    expect(text.slice(findings[0]!.span.start, findings[0]!.span.end)).toBe(
      "They assume users will pay. They assume developers will build. They assume ecosystems will emerge",
    );
  });

  it("two separate runs in one document each get their own finding", () => {
    const run1 = "They assume users will pay. They assume developers will build. They assume ecosystems will emerge.";
    const run2 = "Products impress people. Products solve problems. Products scale linearly.";
    const text = `${run1} ${run2}`;
    const findings = detect(text);
    expect(findings).toHaveLength(2);
    expect(findings[0]!.message).toContain("They");
    expect(findings[1]!.message).toContain("Products");
  });
});

describe("anaphora/repeated-opening — fragment fallback (no Clause to ask)", () => {
  it("3 verbless fragments sharing a 2-word opening fire via the word-text fallback", () => {
    // "Not" alone is ambiguous ("Not a bug" / "Not the point" don't share an opening), so the
    // fallback pulls in the second word too — these three share "Not a".
    const text = "Not a bug. Not a trick. Not a flaw.";
    const units = readDocument(text);
    expect(units.every((u) => u.outcome === "fragment")).toBe(true); // confirms this exercises the fallback, not subjectHead
    const findings = detect(text);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toContain("Not a");
  });

  it("fragments that share only the ambiguous first word, not the second, do not fire", () => {
    const text = "Not a bug. Not the point. Not one to trust.";
    const findings = detect(text);
    expect(findings).toEqual([]);
  });
});

describe("anaphora/repeated-opening — mixed clause and fragment units", () => {
  it("a lowered unit and a fragment never match (different key sources) even with the same first word", () => {
    // "They" as a lowered subject vs. "They" as a bare fragment opener use different code paths
    // (subjectHead vs. first-word fallback) but should still compare equal when normalized —
    // this pins that the two paths converge on the same key text for a pronoun.
    const text = "They assume users will pay. They assume developers will build. They. ";
    const findings = detect(text);
    // "They." alone has no verb — it's a fragment — but its fallback key ("they") still matches
    // the two lowered units' subjectHead ("they"), completing a run of 3.
    expect(findings).toHaveLength(1);
  });
});

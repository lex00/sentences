import { describe, it, expect } from "vitest";
import { buildDocAnalysis } from "../build-doc.js";
import { makeDoc } from "../stub-doc.js";
import { textAt, spanning } from "../span.js";
import { readDocument } from "../../document.js";
import { selfPosedQuestionRule } from "./self-posed-question.js";

describe("syntactic/self-posed-question — terminator-gap shape (readDocument)", () => {
  it("splits a self-posed question into two units with the '?' excluded from both spans", () => {
    const text = "The result? Devastating.";
    const units = readDocument(text);
    expect(units).toHaveLength(2);
    expect(units[0]!.unit).toBe("The result");
    expect(units[1]!.unit).toBe("Devastating");
    // the '?' sits in the gap between the two spans, not inside either one
    expect(text.slice(units[0]!.span.end, units[1]!.span.start)).toContain("?");
    expect(units[0]!.unit).not.toContain("?");
  });
});

describe("syntactic/self-posed-question — acceptance examples (strong form)", () => {
  const examples = [
    "The result? Devastating.",
    "The worst part? Nobody saw it coming.",
    "The scary part? This attack vector is perfect for developers.",
  ];

  it.each(examples)("fires low, once, on %j read through the real document splitter", (text) => {
    const doc = buildDocAnalysis(text);
    const findings = selfPosedQuestionRule.detect(doc);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe("low");
    expect(findings[0]!.ruleId).toBe("syntactic/self-posed-question");
  });

  it("spans from the start of the question to the end of the answer, slicing cleanly", () => {
    const text = "The result? Devastating.";
    const doc = buildDocAnalysis(text);
    const [finding] = selfPosedQuestionRule.detect(doc);
    const expected = spanning([doc.units[0]!.span, doc.units[1]!.span]);
    expect(finding!.span).toEqual(expected);
    expect(textAt(doc, finding!.span)).toBe("The result? Devastating");
  });

  it("escalates to medium with two strong instances in one document", () => {
    const text = `${examples[0]} ${examples[1]}`;
    const findings = selfPosedQuestionRule.detect(buildDocAnalysis(text));
    expect(findings).toHaveLength(2);
    expect(findings.every((f) => f.severity === "medium")).toBe(true);
  });

  it("escalates to high with three or more strong instances in one document", () => {
    const text = examples.join(" ");
    const findings = selfPosedQuestionRule.detect(buildDocAnalysis(text));
    expect(findings).toHaveLength(3);
    expect(findings.every((f) => f.severity === "high")).toBe(true);
    expect(findings.every((f) => f.message.includes("3 in this piece"))).toBe(true);
  });
});

describe("syntactic/self-posed-question — weak form (real question, punchy answer)", () => {
  // 5 words — over STRONG_MAX_WORDS(4), so this is never the strong "The X?" shape even though
  // makeDoc's default outcome ("unparseable") makes it look verbless too.
  const q1 = "This one here right now?";
  const a1 = "Sure thing.";
  const q2 = "That other spot over yonder?";
  const a2 = "Fine indeed.";

  it("stays quiet on a single real question with a short answer — not yet a pattern", () => {
    const findings = selfPosedQuestionRule.detect(makeDoc(`${q1} ${a1}`));
    expect(findings).toEqual([]);
  });

  it("fires medium once the weak shape repeats", () => {
    const findings = selfPosedQuestionRule.detect(makeDoc(`${q1} ${a1} ${q2} ${a2}`));
    expect(findings).toHaveLength(2);
    expect(findings.every((f) => f.severity === "medium")).toBe(true);
  });

  it("does not fire the weak form when the answer runs past the punchy threshold", () => {
    // Answer is 7 words — over WEAK_ANSWER_MAX_WORDS(6) but under the strong-form's 12-word cap.
    const text = `${q1} ${a1} That other spot over yonder? It took quite a while to explain.`;
    const findings = selfPosedQuestionRule.detect(makeDoc(text));
    // Only the first (repeated) weak pair still qualifies... but a lone qualifying pair is not a
    // pattern on its own, so nothing fires at all.
    expect(findings).toEqual([]);
  });
});

describe("syntactic/self-posed-question — must NOT fire", () => {
  it("a real question answered at length (FAQ prose) never fires, even alone", () => {
    const text =
      "What is dependency injection? It is a design pattern where an object receives its dependencies " +
      "from an external source rather than creating them itself, which makes testing far easier.";
    expect(selfPosedQuestionRule.detect(buildDocAnalysis(text))).toEqual([]);
  });

  it("a real question followed by a full paragraph does not fire", () => {
    const text =
      "Why does this matter? Because it fundamentally changes how the system behaves under load, " +
      "and that changes everything downstream for every team that depends on it.";
    expect(selfPosedQuestionRule.detect(buildDocAnalysis(text))).toEqual([]);
  });

  it("the strong form does not fire once the answer exceeds the max-answer-words threshold", () => {
    const q = "This one here now?";
    const a12 = "one two three four five six seven eight nine ten eleven twelve.";
    const a13 = "one two three four five six seven eight nine ten eleven twelve thirteen.";
    expect(selfPosedQuestionRule.detect(makeDoc(`${q} ${a12}`))).toHaveLength(1); // exactly at the cap
    expect(selfPosedQuestionRule.detect(makeDoc(`${q} ${a13}`))).toEqual([]); // one word past it
  });

  it("suppresses when the question itself is a markdown heading", () => {
    const text = "## The result?\n\nDevastating.";
    expect(selfPosedQuestionRule.detect(buildDocAnalysis(text))).toEqual([]);
    expect(selfPosedQuestionRule.detect(makeDoc(text))).toEqual([]);
  });

  it("suppresses when a heading sits between the question and its answer", () => {
    const text = "The result?\n## Aside\nDevastating.";
    // via a splitter that breaks on newlines, the heading is its own unit between question and answer
    expect(selfPosedQuestionRule.detect(makeDoc(text))).toEqual([]);
    // via readDocument (no newline splitting) the heading text is glued onto the front of the answer
    // unit instead — still suppressed, since a real heading line still sits in that stretch of text
    expect(selfPosedQuestionRule.detect(buildDocAnalysis(text))).toEqual([]);
  });

  it("does not treat a question immediately followed by another question as answered", () => {
    const text = "The result? Really? Devastating.";
    // "The result?" -> "Really?" is not a declarative answer (it's itself a question), so no pairing
    // forms there; "Really?" -> "Devastating." IS a strong pairing and is free to fire on its own.
    const findings = selfPosedQuestionRule.detect(buildDocAnalysis(text));
    expect(findings.every((f) => textAt(buildDocAnalysis(text), f.span).startsWith("Really"))).toBe(true);
  });
});

describe("syntactic/self-posed-question — teaching voice", () => {
  it("names the pattern in the message and teaches in the explanation", () => {
    const findings = selfPosedQuestionRule.detect(buildDocAnalysis("The result? Devastating."));
    expect(findings[0]!.message).toContain("The result");
    expect(findings[0]!.explanation.length).toBeGreaterThan(20);
  });
});

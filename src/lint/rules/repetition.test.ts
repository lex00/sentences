import { describe, it, expect } from "vitest";
import { runRules } from "../engine.js";
import { makeDoc, spanOf } from "../stub-doc.js";
import { textAt } from "../span.js";
import { nearDuplicateRule, dilutionRule } from "./repetition.js";

// A tight technical doc that necessarily repeats a term ("the parser") once per DISTINCT
// sentence — the must-not-fire case from issue #22. Different surrounding words each time keeps
// character 4-gram and trigram overlap low even though the term itself recurs.
const TECH_DOC = [
  "The parser reads the source text carefully before anything else happens.",
  "The parser then builds a tree from every token it recognizes.",
  "The parser walks each node in the tree during a later pass.",
  "The parser reports any errors it finds along the way.",
  "The parser finishes by writing formatted output to disk.",
  "The lexer splits the raw characters into those same tokens first.",
  "The checker validates every declared type against its recorded usage.",
  "The formatter rewrites the resulting tree back into readable indented source.",
].join(" ");

describe("repetition/near-duplicate", () => {
  it("fires high-severity on a paragraph pasted twice", () => {
    const para = "The quarterly report shows revenue increased significantly across all major regions this year.";
    const text = `${para} ${para}`;
    const { findings } = runRules([nearDuplicateRule], makeDoc(text));
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe("high");
    expect(findings[0]!.ruleId).toBe("repetition/near-duplicate");
    // The finding spans the LATER duplicate; the message names the earlier one's position.
    expect(findings[0]!.span).toEqual(spanOf(text, para, 2));
    expect(findings[0]!.message).toContain("position 1");
  });

  it("fires medium-severity on a close paraphrase (0.65-0.8 char-4-gram cosine)", () => {
    const a = "The quarterly report shows revenue increased significantly across all major regions this year.";
    const b = "This quarterly report shows that revenue climbed significantly across most major regions this year.";
    const text = `${a} ${b}`;
    const { findings } = runRules([nearDuplicateRule], makeDoc(text));
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe("medium");
    expect(textAt(makeDoc(text), findings[0]!.span)).toBe(b);
  });

  it("stays clean on unrelated sentences", () => {
    const text = "The dog chased the ball. A different cat slept on the warm windowsill all afternoon.";
    expect(runRules([nearDuplicateRule], makeDoc(text)).findings).toEqual([]);
  });

  it("must-not-fire: a tight technical doc repeating a term once per distinct sentence stays clean", () => {
    expect(runRules([nearDuplicateRule], makeDoc(TECH_DOC)).findings).toEqual([]);
  });

  it("ignores short units entirely — they'd trivially collide on 4-grams", () => {
    const text = "Yes. Yes. Yes. Yes.";
    expect(runRules([nearDuplicateRule], makeDoc(text)).findings).toEqual([]);
  });

  it("keeps only the single best earlier match when a unit echoes more than one prior unit", () => {
    const a = "The quarterly report shows revenue increased significantly across all major regions this year.";
    const b = "This quarterly report shows that revenue climbed significantly across most major regions this year.";
    const c = a; // exact repeat of `a`, and — via `a` — also similar to `b`
    const text = [a, b, c].join(" ");
    const { findings } = runRules([nearDuplicateRule], makeDoc(text));
    expect(findings).toHaveLength(2);
    // `b` (unit 2) matches `a` (unit 1) at medium severity.
    expect(findings[0]!.span).toEqual(spanOf(text, b));
    expect(findings[0]!.severity).toBe("medium");
    expect(findings[0]!.message).toContain("position 1");
    // `c` (unit 3) is an EXACT match of `a` (unit 1, cosine 1.0) — that beats its weaker overlap
    // with `b` (unit 2), so it's attributed to `a`, not double-counted against both.
    expect(findings[1]!.span).toEqual(spanOf(text, c, 2));
    expect(findings[1]!.severity).toBe("high");
    expect(findings[1]!.message).toContain("position 1");
  });

  it("bails out past the comparison cap and reports a low-severity note instead of stalling", () => {
    const sentences = Array.from(
      { length: 510 },
      (_, i) => `Sentence number ${i} adds some unrelated filler content so it clears the minimum length.`,
    );
    const text = sentences.join(" ");
    const { findings } = runRules([nearDuplicateRule], makeDoc(text));
    const capNote = findings.find((f) => f.message.includes("capped"));
    expect(capNote).toBeDefined();
    expect(capNote!.severity).toBe("low");
    expect(capNote!.span).toEqual({ start: 0, end: text.length });
  }, 20_000);

  it("is deterministic", () => {
    const text = `${TECH_DOC} ${TECH_DOC}`;
    const doc = makeDoc(text);
    const r1 = JSON.stringify(runRules([nearDuplicateRule], doc));
    const r2 = JSON.stringify(runRules([nearDuplicateRule], makeDoc(text)));
    expect(r1).toBe(r2);
  });
});

describe("repetition/dilution", () => {
  it("flags a document whose 3-word runs mostly restate an earlier one, naming the repeated phrases", () => {
    const text = [
      "The team quietly finished the project.",
      "The team quietly finished the report.",
      "The team quietly finished the review.",
      "The team quietly finished the audit.",
    ].join(" ");
    const { findings } = runRules([dilutionRule], makeDoc(text));
    expect(findings).toHaveLength(1);
    const f = findings[0]!;
    expect(f.severity).toBe("low");
    expect(f.span).toEqual({ start: 0, end: text.length });
    expect(f.message).toMatch(/^\d+% of this document's 3-word runs restate an earlier one$/);
    expect(f.explanation).toContain("team quietly finished");
    expect(f.explanation).toContain("x4");
  });

  it("must-not-fire: a tight technical doc with varied phrasing stays clean", () => {
    expect(runRules([dilutionRule], makeDoc(TECH_DOC)).findings).toEqual([]);
  });

  it("skips documents too short for the ratio to mean anything", () => {
    expect(runRules([dilutionRule], makeDoc("The dog chased the ball across the yard today.")).findings).toEqual([]);
  });

  it("is deterministic", () => {
    const text = Array(5).fill("The same three words repeat here every single time without fail.").join(" ");
    const doc = makeDoc(text);
    const r1 = JSON.stringify(runRules([dilutionRule], doc));
    const r2 = JSON.stringify(runRules([dilutionRule], makeDoc(text)));
    expect(r1).toBe(r2);
  });
});

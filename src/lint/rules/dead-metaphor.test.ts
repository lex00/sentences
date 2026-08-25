import { describe, it, expect } from "vitest";
import { runRules } from "../engine.js";
import { makeDoc, spanOf } from "../stub-doc.js";
import { deadMetaphorRule } from "./dead-metaphor.js";

// Terse, repeated-rare-word fixtures: each sentence contributes the target word plus THREE
// unique, made-up tokens (marker7, tag7, note7 — never repeated elsewhere), so the target word is
// the only lemma that ever recurs. This isolates the "one lemma recurring far above the
// document's own baseline" signal from any other source of repetition.
function wallDoc(n: number): string {
  return Array.from({ length: n }, (_, i) => `Wall marker${i} tag${i} note${i}.`).join(" ");
}

// A tight technical doc that necessarily repeats a domain term ("parser") once per distinct
// sentence — the must-not-fire case from issue #22, extended with three more sentences so the
// document clears MIN_DOC_CONTENT_WORDS and the rule's threshold logic (not just the "too short
// to judge" floor) is what keeps it clean.
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

describe("dead-metaphor/rare-lemma", () => {
  it("flags a rare lemma recurring far above the document's baseline (medium band)", () => {
    const text = wallDoc(25); // 100 content words, minCount = max(10, ceil(100*0.04)) = 10; 25 >= 10*1.5
    const { findings } = runRules([deadMetaphorRule], makeDoc(text));
    expect(findings).toHaveLength(1);
    const f = findings[0]!;
    expect(f.ruleId).toBe("dead-metaphor/rare-lemma");
    expect(f.severity).toBe("medium");
    expect(f.message).toContain("“wall”");
    expect(f.message).toContain("recurs 25 times");
    expect(f.span).toEqual(spanOf(text, "Wall"));
  });

  it("scales severity up to high for a much larger overshoot", () => {
    const text = wallDoc(40); // 160 content words, minCount = max(10, ceil(160*0.04)) = 10; 40 >= 10*3
    const { findings } = runRules([deadMetaphorRule], makeDoc(text));
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe("high");
    expect(findings[0]!.message).toContain("recurs 40 times");
  });

  it("groups inflected surface forms of the same lemma together", () => {
    const singular = Array.from({ length: 6 }, (_, i) => `Wall marker${i} tag${i} note${i}.`);
    const plural = Array.from({ length: 6 }, (_, i) => `Walls beacon${i} flag${i} spot${i}.`);
    const text = [...singular, ...plural].join(" ");
    const { findings } = runRules([deadMetaphorRule], makeDoc(text));
    // 48 content words total, minCount = max(10, ceil(48*0.04)=2) = 10; combined count 12 >= 10*1.5? no (15) -> low
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toContain("“wall/walls”");
    expect(findings[0]!.message).toContain("recurs 12 times");
    expect(findings[0]!.severity).toBe("low");
  });

  it("does not fire below the document-length floor, regardless of how concentrated a word is", () => {
    const text = "Wall marker0 tag0 note0. Wall marker1 tag1 note1. Wall marker2 tag2 note2.";
    expect(runRules([deadMetaphorRule], makeDoc(text)).findings).toEqual([]);
  });

  it("must-not-fire: ordinary domain-term repetition across distinct sentences stays clean", () => {
    // "parser" recurs 5 times in a document with 49 qualifying content words: comfortably under
    // the absolute floor (10), which is the point — a handful of mentions of one technical term
    // is unremarkable no matter the document's size.
    expect(runRules([deadMetaphorRule], makeDoc(TECH_DOC)).findings).toEqual([]);
  });

  it("never flags a common English word regardless of how often it recurs", () => {
    const text = Array.from({ length: 60 }, (_, i) => `Consider topic${i} detail${i} effort${i}.`).join(" ");
    // "consider" is in COMMON_WORDS; it must stay unflagged even at 60 occurrences.
    expect(runRules([deadMetaphorRule], makeDoc(text)).findings).toEqual([]);
  });

  it("filters an inflected common word via its lemma, not just its exact surface form", () => {
    // "shows" is not itself in COMMON_WORDS, but its lemma "show" is — the filter has to check
    // both, or a common verb's plain -s form would look like a rare, recurring content word.
    const text = Array.from({ length: 60 }, (_, i) => `It shows topic${i} detail${i} effort${i}.`).join(" ");
    expect(runRules([deadMetaphorRule], makeDoc(text)).findings).toEqual([]);
  });

  it("reports at most the top-8 candidates when more than 8 lemmas qualify", () => {
    // 10 lemmas, each recurring 20-29 times (2 content tokens per sentence, 490 total content
    // words -> minCount = max(10, ceil(490*0.04)) = 20). Every lemma clears that floor, so
    // TOP_K's slice is the only thing standing between 10 candidates and 8 findings.
    const lemmas = ["griffin", "obelisk", "lantern", "compass", "anchor", "beacon", "chalice", "quiver", "thicket", "cinder"];
    const text = lemmas
      .map((word, i) => Array.from({ length: 20 + i }, (_, j) => `${word} marker${i}x${j}.`).join(" "))
      .join(" ");
    const { findings } = runRules([deadMetaphorRule], makeDoc(text));
    expect(findings).toHaveLength(8);
    // Highest counts win: "cinder" (29) through "chalice" (22) qualify; "griffin" (20) and
    // "obelisk" (21) are the two lowest-count candidates and are the ones dropped.
    const flagged = findings.map((f) => f.message);
    expect(flagged.some((m) => m.includes("“cinder”"))).toBe(true);
    expect(flagged.some((m) => m.includes("“griffin”"))).toBe(false);
    expect(flagged.some((m) => m.includes("“obelisk”"))).toBe(false);
  });

  it("is deterministic", () => {
    const text = wallDoc(25);
    const doc = makeDoc(text);
    const r1 = JSON.stringify(runRules([deadMetaphorRule], doc));
    const r2 = JSON.stringify(runRules([deadMetaphorRule], makeDoc(text)));
    expect(r1).toBe(r2);
  });
});

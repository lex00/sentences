import { describe, it, expect } from "vitest";
import { ingTackOnRule } from "./ing-tackon.js";
import { readDocument } from "../../document.js";
import { wordSpans } from "../stub-doc.js";
import { textAt } from "../span.js";
import type { Clause } from "../../ir.js";
import type { DocAnalysis, UnitAnalysis } from "../types.js";

// Hand-built Clause IR — "plain data" per #18 — for structural certainty over path 1 (the
// IR-based detector). `words` comes from stub-doc.ts's wordSpans() so span offsets are real.
function docOf(text: string, clauses: Clause[]): DocAnalysis {
  const span = { start: 0, end: text.length };
  const unit: UnitAnalysis = { unit: text, span, outcome: "lowered", clauses, words: wordSpans(text, span) };
  return { text, units: [unit] };
}

function docOfMany(pairs: Array<[string, Clause]>): DocAnalysis {
  const text = pairs.map(([t]) => `${t}.`).join(" ");
  let cursor = 0;
  const units: UnitAnalysis[] = pairs.map(([t, clause]) => {
    const start = text.indexOf(t, cursor);
    const span = { start, end: start + t.length };
    cursor = span.end;
    return { unit: t, span, outcome: "lowered", clauses: [clause], words: wordSpans(text, span) };
  });
  return { text, units };
}

// A plain-text unit (no clauses at all) for path 2 tests — the token-shape fallback works off
// words/text alone and doesn't need a parse.
function docOfText(text: string): DocAnalysis {
  const span = { start: 0, end: text.length };
  const unit: UnitAnalysis = { unit: text, span, outcome: "unparseable", reason: "n/a for this test", words: wordSpans(text, span) };
  return { text, units: [unit] };
}

// The real rule-based parser + word offsets, for the end-to-end acceptance tests — see
// serves-as.test.ts for why this is assembled here rather than via analyzeDocument (#9, not yet
// built, out of scope for #18).
function analyzeReal(text: string): DocAnalysis {
  const units: UnitAnalysis[] = readDocument(text).map((u) => ({ ...u, words: wordSpans(text, u.span) }));
  return { text, units };
}

const detect = (doc: DocAnalysis) => ingTackOnRule.detect(doc);

describe("ing-tackon — path 1 (IR-based, confirmed)", () => {
  it('fires on a trailing participle on the subject that reaches the unit\'s end ("...opened in 1994, highlighting its importance.")', () => {
    const text = "The station opened in 1994, highlighting its importance";
    const clause: Clause = {
      subject: {
        head: { text: "station", pos: "NN" },
        modifiers: [
          { kind: "word", value: { text: "The", pos: "DT" } },
          // comma-set-off, trailing — the shape lower.ts's lowerClause gives a sibling
          // participial S regardless of where it sits relative to the verb (see ing-tackon.ts's
          // file header for why the real parser doesn't actually produce this for this example).
          { kind: "participle", verb: { text: "highlighting" }, object: { head: { text: "importance", pos: "NN" }, modifiers: [{ kind: "word", value: { text: "its", pos: "PRP$" } }] }, modifiers: [] },
        ],
      },
      verb: {
        head: { text: "opened", pos: "VBD" },
        modifiers: [{ kind: "prep", prep: { text: "in" }, object: { head: { text: "1994", pos: "NN" }, modifiers: [] } }],
      },
      complement: null,
    };
    const doc = docOf(text, [clause]);
    const findings = detect(doc);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.ruleId).toBe("ing-tackon");
    expect(textAt(doc, findings[0]!.span)).toBe("highlighting");
    // path 1 (confirmed) sits at the lexicon's own defaultSeverity, "low" — see file header.
    expect(findings[0]!.severity).toBe("low");
  });

  it('does NOT fire on a mid-sentence participle doing real work ("The report highlighting the risks worried the board.")', () => {
    const text = "The report highlighting the risks worried the board";
    const clause: Clause = {
      subject: {
        head: { text: "report", pos: "NN" },
        modifiers: [
          { kind: "word", value: { text: "The", pos: "DT" } },
          { kind: "participle", verb: { text: "highlighting" }, object: { head: { text: "risks", pos: "NNS" }, modifiers: [{ kind: "word", value: { text: "the", pos: "DT" } }] }, modifiers: [] },
        ],
      },
      verb: { head: { text: "worried", pos: "VBD" }, modifiers: [] },
      complement: { kind: "directObject", value: { head: { text: "board", pos: "NN" }, modifiers: [{ kind: "word", value: { text: "the", pos: "DT" } }] } },
    };
    // Lexicon + attachment (trailing modifier on the subject) both hold here — only POSITION
    // rejects it: three more words ("worried the board") follow before the unit ends.
    expect(detect(docOf(text, [clause]))).toEqual([]);
  });

  it('does NOT fire when the verb is not in the lexicon, even comma-set-off and trailing ("The dog, barking furiously, chased the ball.")', () => {
    const text = "The dog, barking furiously, chased the ball";
    const clause: Clause = {
      subject: {
        head: { text: "dog", pos: "NN" },
        modifiers: [
          { kind: "word", value: { text: "The", pos: "DT" } },
          { kind: "participle", verb: { text: "barking" }, object: null, modifiers: [{ kind: "word", value: { text: "furiously", pos: "RB" } }] },
        ],
      },
      verb: { head: { text: "chased", pos: "VBD" }, modifiers: [] },
      complement: { kind: "directObject", value: { head: { text: "ball", pos: "NN" }, modifiers: [{ kind: "word", value: { text: "the", pos: "DT" } }] } },
    };
    expect(detect(docOf(text, [clause]))).toEqual([]);
  });

  it('fires on a trailing participle on the COMPLEMENT ("She wrote the report, summarizing the findings.")', () => {
    // "summarize" isn't in the lexicon, so use a listed verb in the same position instead:
    // "She wrote the report, reflecting the team's priorities."
    const text = "She wrote the report, reflecting the team's priorities";
    const clause: Clause = {
      subject: { head: { text: "She", pos: "PRP" }, modifiers: [] },
      verb: { head: { text: "wrote", pos: "VBD" }, modifiers: [] },
      complement: {
        kind: "directObject",
        value: {
          head: { text: "report", pos: "NN" },
          modifiers: [
            { kind: "word", value: { text: "the", pos: "DT" } },
            { kind: "participle", verb: { text: "reflecting" }, object: { head: { text: "priorities", pos: "NNS" }, modifiers: [{ kind: "word", value: { text: "team's", pos: "PRP$" } }] }, modifiers: [] },
          ],
        },
      },
    };
    const doc = docOf(text, [clause]);
    const findings = detect(doc);
    expect(findings).toHaveLength(1);
    expect(textAt(doc, findings[0]!.span)).toBe("reflecting");
  });

  it("escalates to \"medium\" once the document repeats the pattern at the lexicon's densityThreshold", () => {
    const clauseA: Clause = {
      subject: { head: { text: "station", pos: "NN" }, modifiers: [{ kind: "participle", verb: { text: "highlighting" }, object: { head: { text: "importance", pos: "NN" }, modifiers: [] }, modifiers: [] }] },
      verb: { head: { text: "opened", pos: "VBD" }, modifiers: [] },
      complement: null,
    };
    const clauseB: Clause = {
      subject: { head: { text: "law", pos: "NN" }, modifiers: [{ kind: "participle", verb: { text: "underscoring" }, object: { head: { text: "urgency", pos: "NN" }, modifiers: [] }, modifiers: [] }] },
      verb: { head: { text: "passed", pos: "VBD" }, modifiers: [] },
      complement: null,
    };
    const doc = docOfMany([
      ["The station opened, highlighting importance", clauseA],
      ["The law passed, underscoring urgency", clauseB],
    ]);
    const findings = detect(doc);
    expect(findings).toHaveLength(2);
    // Both hits share document-wide density (rules/demo.ts's "count first, judge second"): once
    // the pattern repeats, path 1's severity moves one tier above the lexicon's own "low" default.
    expect(findings.every((f) => f.severity === "medium")).toBe(true);
  });
});

describe("ing-tackon — path 2 (token-shape fallback, candidate severity)", () => {
  it('fires on comma + listed -ing verb near the unit\'s end with no parse at all', () => {
    const text = "The station opened in 1994, highlighting its importance";
    const doc = docOfText(text);
    const findings = detect(doc);
    expect(findings).toHaveLength(1);
    expect(textAt(doc, findings[0]!.span)).toBe("highlighting");
    expect(findings[0]!.severity).toBe("candidate");
  });

  it("does NOT fire when the comma sits too far from the end (a long tail follows)", () => {
    const text = "Contributing to the team's success, she was promoted twice in two years after joining";
    expect(detect(docOfText(text))).toEqual([]);
  });

  it("does NOT fire on an -ing word not preceded by a comma", () => {
    const text = "The team kept highlighting the same risks all quarter";
    expect(detect(docOfText(text))).toEqual([]);
  });

  it("does NOT fire on an -ing word not in the lexicon, even with a trailing comma", () => {
    const text = "He wrote the report, laughing the whole time";
    expect(detect(docOfText(text))).toEqual([]);
  });

  it("does not double-report a unit path 1 already confirmed", () => {
    const text = "The station opened in 1994, highlighting its importance";
    const clause: Clause = {
      subject: {
        head: { text: "station", pos: "NN" },
        modifiers: [{ kind: "participle", verb: { text: "highlighting" }, object: { head: { text: "importance", pos: "NN" }, modifiers: [{ kind: "word", value: { text: "its", pos: "PRP$" } }] }, modifiers: [] }],
      },
      verb: { head: { text: "opened", pos: "VBD" }, modifiers: [] },
      complement: null,
    };
    const doc = docOf(text, [clause]);
    const findings = detect(doc);
    expect(findings).toHaveLength(1); // path 1's finding only, not path 1 + path 2 on the same unit
    expect(findings[0]!.severity).toBe("low");
  });
});

describe("ing-tackon — must-not-fire acceptance case", () => {
  it('"The dog barking furiously bit me." never fires, through the real parser either', () => {
    expect(detect(analyzeReal("The dog barking furiously bit me."))).toEqual([]);
  });
});

describe("ing-tackon — end to end through readDocument", () => {
  it("path 1 fires for #18's own example now that the chunker keeps the trailing participle (engine bug #33)", () => {
    const text = "The station opened in 1994, highlighting its importance.";
    // Was pinned as a gap: parse() returned `(S (NP The station) (VP (VBD opened) (PP in 1994)))`
    // and dropped ", highlighting its importance" outright, so only path 2 (token shape) could
    // catch this. The participle now survives as a modifier on the subject.
    const doc = analyzeReal(text);
    const clause = doc.units[0]!.clauses![0]!;
    expect("modifiers" in clause.subject && clause.subject.modifiers.some((m) => m.kind === "participle")).toBe(true);

    const findings = detect(doc);
    expect(findings).toHaveLength(1); // path 1 confirms the unit, so path 2 skips it — never both
    expect(textAt(doc, findings[0]!.span)).toBe("highlighting");
    expect(findings[0]!.severity).toBe("low"); // IR-confirmed, not the fallback's "candidate"
  });
});

import { describe, it, expect } from "vitest";
import { servesAsDodgeRule } from "./serves-as.js";
import { readDocument } from "../../document.js";
import { wordSpans } from "../stub-doc.js";
import { textAt } from "../span.js";
import type { Clause } from "../../ir.js";
import type { DocAnalysis, UnitAnalysis } from "../types.js";

// Hand-built Clause IR — "plain data" per #18, so the structural checks in serves-as.ts are
// pinned against exact shapes rather than whatever today's rule-based parser happens to produce
// (see serves-as.ts's PARSER GAP note: the real parser can't produce the phrasal frame's shape at
// all today). `words` comes from stub-doc.ts's own wordSpans() so span offsets are real, not
// hand-counted.
function docOf(text: string, clauses: Clause[]): DocAnalysis {
  const span = { start: 0, end: text.length };
  const unit: UnitAnalysis = { unit: text, span, outcome: "lowered", clauses, words: wordSpans(text, span) };
  return { text, units: [unit] };
}

// Two sentences, two independently hand-built clauses — one per unit — for the density test.
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

// The real rule-based parser + word offsets, for the end-to-end acceptance tests. analyzeDocument
// (#9) doesn't exist yet (out of scope for #18 — "do not create analyze-document.ts"), so this
// assembles the same shape from the pieces that do exist: readDocument for clauses, stub-doc's own
// wordSpans() for offsets.
function analyzeReal(text: string): DocAnalysis {
  const units: UnitAnalysis[] = readDocument(text).map((u) => ({ ...u, words: wordSpans(text, u.span) }));
  return { text, units };
}

const detect = (doc: DocAnalysis) => servesAsDodgeRule.detect(doc);

describe("serves-as-dodge — phrasal frame (serve as / stand as)", () => {
  it('fires on "The building serves as a reminder." — as-PP with a plain nominal object', () => {
    const text = "The building serves as a reminder.";
    const clause: Clause = {
      subject: { head: { text: "building", pos: "NN" }, modifiers: [{ kind: "word", value: { text: "The", pos: "DT" } }] },
      verb: {
        head: { text: "serves", pos: "VBZ" },
        modifiers: [
          { kind: "prep", prep: { text: "as" }, object: { head: { text: "reminder", pos: "NN" }, modifiers: [{ kind: "word", value: { text: "a", pos: "DT" } }] } },
        ],
      },
      complement: null,
    };
    const doc = docOf(text, [clause]);
    const findings = detect(doc);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.ruleId).toBe("serves-as-dodge");
    expect(textAt(doc, findings[0]!.span)).toBe("serves");
    // full severity: one tier above the lexicon's own "low" default — see serves-as.ts's SEVERITY TIERS note.
    expect(findings[0]!.severity).toBe("medium");
  });

  it('does NOT fire on "The waiter serves as many tables as he can." — comparative "as ... as", not a plain nominal', () => {
    const dummyClause: Clause = { subject: { head: { text: "he", pos: "PRP" }, modifiers: [] }, verb: { head: { text: "can", pos: "MD" }, modifiers: [] }, complement: null };
    const clause: Clause = {
      subject: { head: { text: "waiter", pos: "NN" }, modifiers: [{ kind: "word", value: { text: "The", pos: "DT" } }] },
      verb: {
        head: { text: "serves", pos: "VBZ" },
        modifiers: [
          {
            kind: "prep",
            prep: { text: "as" },
            object: {
              head: { text: "tables", pos: "NNS" },
              // The trailing "as he can" attaches its own "as"-connected clause modifier to the
              // object — that's the structural tell this is the comparative, not "serve as NOUN".
              modifiers: [{ kind: "word", value: { text: "many", pos: "JJ" } }, { kind: "clause", connector: { text: "as" }, value: dummyClause }],
            },
          },
        ],
      },
      complement: null,
    };
    const doc = docOf("The waiter serves as many tables as he can.", [clause]);
    expect(detect(doc)).toEqual([]);
  });

  it('fires on "The mural stands as a memorial."', () => {
    const clause: Clause = {
      subject: { head: { text: "mural", pos: "NN" }, modifiers: [{ kind: "word", value: { text: "The", pos: "DT" } }] },
      verb: {
        head: { text: "stands", pos: "VBZ" },
        modifiers: [{ kind: "prep", prep: { text: "as" }, object: { head: { text: "memorial", pos: "NN" }, modifiers: [{ kind: "word", value: { text: "a", pos: "DT" } }] } }],
      },
      complement: null,
    };
    const doc = docOf("The mural stands as a memorial.", [clause]);
    const findings = detect(doc);
    expect(findings).toHaveLength(1);
    expect(textAt(doc, findings[0]!.span)).toBe("stands");
    expect(findings[0]!.severity).toBe("medium");
  });

  it('does NOT fire on "She stood as tall as her brother." — no "as"+nominal PP on the verb at all', () => {
    // "as tall as" lowers to a predicate-adjective comparative, not an "as"-PP hanging off the
    // verb — there is simply no evidence for asPhraseObject to find here, hand-built or otherwise.
    const clause: Clause = {
      subject: { head: { text: "She", pos: "PRP" }, modifiers: [] },
      verb: { head: { text: "stood", pos: "VBD" }, modifiers: [] },
      complement: { kind: "predicateAdj", value: { text: "tall" } },
    };
    const doc = docOf("She stood as tall as her brother.", [clause]);
    expect(detect(doc)).toEqual([]);
  });
});

describe("serves-as-dodge — bare frame (mark / represent)", () => {
  it('fires on "The plaque marks a turning point." at "candidate" severity below the density threshold', () => {
    const clause: Clause = {
      subject: { head: { text: "plaque", pos: "NN" }, modifiers: [{ kind: "word", value: { text: "The", pos: "DT" } }] },
      verb: { head: { text: "marks", pos: "VBZ" }, modifiers: [] },
      complement: {
        kind: "directObject",
        value: { head: { text: "point", pos: "NN" }, modifiers: [{ kind: "word", value: { text: "a", pos: "DT" } }, { kind: "word", value: { text: "turning", pos: "JJ" } }] },
      },
    };
    const doc = docOf("The plaque marks a turning point.", [clause]);
    const findings = detect(doc);
    expect(findings).toHaveLength(1);
    expect(textAt(doc, findings[0]!.span)).toBe("marks");
    expect(findings[0]!.severity).toBe("candidate");
  });

  it('does NOT fire on "The marks on the wall are ugly." — "marks" is the subject noun, never the verb', () => {
    const clause: Clause = {
      subject: {
        head: { text: "marks", pos: "NNS" },
        modifiers: [{ kind: "word", value: { text: "The", pos: "DT" } }, { kind: "prep", prep: { text: "on" }, object: { head: { text: "wall", pos: "NN" }, modifiers: [{ kind: "word", value: { text: "the", pos: "DT" } }] } }],
      },
      verb: { head: { text: "are", pos: "VBP" }, modifiers: [] },
      complement: { kind: "predicateAdj", value: { text: "ugly" } },
    };
    const doc = docOf("The marks on the wall are ugly.", [clause]);
    expect(detect(doc)).toEqual([]);
  });

  it('fires on "This documentary represents a turning point."', () => {
    const clause: Clause = {
      subject: { head: { text: "documentary", pos: "NN" }, modifiers: [{ kind: "word", value: { text: "This", pos: "DT" } }] },
      verb: { head: { text: "represents", pos: "VBZ" }, modifiers: [] },
      complement: {
        kind: "directObject",
        value: { head: { text: "point", pos: "NN" }, modifiers: [{ kind: "word", value: { text: "a", pos: "DT" } }, { kind: "word", value: { text: "turning", pos: "JJ" } }] },
      },
    };
    const doc = docOf("This documentary represents a turning point.", [clause]);
    const findings = detect(doc);
    expect(findings).toHaveLength(1);
    expect(textAt(doc, findings[0]!.span)).toBe("represents");
  });

  it('does NOT fire on "The district is represented by the senator." — passive voice leaves clause.complement null', () => {
    const clause: Clause = {
      subject: { head: { text: "district", pos: "NN" }, modifiers: [{ kind: "word", value: { text: "The", pos: "DT" } }] },
      verb: { head: { text: "is represented" }, modifiers: [{ kind: "prep", prep: { text: "by" }, object: { head: { text: "senator", pos: "NN" }, modifiers: [{ kind: "word", value: { text: "the", pos: "DT" } }] } }] },
      complement: null,
    };
    const doc = docOf("The district is represented by the senator.", [clause]);
    expect(detect(doc)).toEqual([]);
  });

  it("does NOT fire when the POS gate rejects a mistagged head (defensive, even though this shouldn't arise from a real parse)", () => {
    const clause: Clause = {
      subject: { head: { text: "it", pos: "PRP" }, modifiers: [] },
      verb: { head: { text: "marks", pos: "NN" }, modifiers: [] }, // mistagged noun, not verb
      complement: { kind: "directObject", value: { head: { text: "point", pos: "NN" }, modifiers: [] } },
    };
    expect(detect(docOf("It marks point.", [clause]))).toEqual([]);
  });

  it("escalates bare hits to \"low\" once the document repeats the pattern at the lexicon's densityThreshold", () => {
    const markClause: Clause = {
      subject: { head: { text: "plaque", pos: "NN" }, modifiers: [] },
      verb: { head: { text: "marks", pos: "VBZ" }, modifiers: [] },
      complement: { kind: "directObject", value: { head: { text: "point", pos: "NN" }, modifiers: [] } },
    };
    const representClause: Clause = {
      subject: { head: { text: "film", pos: "NN" }, modifiers: [] },
      verb: { head: { text: "represents", pos: "VBZ" }, modifiers: [] },
      complement: { kind: "directObject", value: { head: { text: "shift", pos: "NN" }, modifiers: [] } },
    };
    const doc = docOfMany([
      ["The plaque marks a point", markClause],
      ["The film represents a shift", representClause],
    ]);
    const findings = detect(doc);
    expect(findings).toHaveLength(2);
    expect(findings.every((f) => f.severity === "low")).toBe(true);
  });

  it("does not crash on a Compound predicate and reports nothing for it (out of scope, matches ir-query's isCopular)", () => {
    const clause: Clause = {
      subject: { head: { text: "it", pos: "PRP" }, modifiers: [] },
      verb: {
        conjunction: { text: "and" },
        items: [
          { verb: { head: { text: "marks", pos: "VBZ" }, modifiers: [] }, complement: { kind: "directObject", value: { head: { text: "point", pos: "NN" }, modifiers: [] } } },
          { verb: { head: { text: "represents", pos: "VBZ" }, modifiers: [] }, complement: { kind: "directObject", value: { head: { text: "shift", pos: "NN" }, modifiers: [] } } },
        ],
      },
      complement: null,
    };
    expect(detect(docOf("It marks a point and represents a shift.", [clause]))).toEqual([]);
  });
});

describe("serves-as-dodge — span behavior", () => {
  it("degrades to the unit's own span when the word can't be located in unit.words", () => {
    const clause: Clause = {
      subject: { head: { text: "plaque", pos: "NN" }, modifiers: [] },
      verb: { head: { text: "marks", pos: "VBZ" }, modifiers: [] },
      complement: { kind: "directObject", value: { head: { text: "point", pos: "NN" }, modifiers: [] } },
    };
    const span = { start: 0, end: 10 };
    const unit: UnitAnalysis = { unit: "0123456789", span, outcome: "lowered", clauses: [clause], words: [] }; // no words at all
    const doc: DocAnalysis = { text: "0123456789", units: [unit] };
    const findings = detect(doc);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.span).toEqual(span);
  });
});

describe("serves-as-dodge — parser gap (reported, not fixed here)", () => {
  it("the phrasal frame cannot fire through today's readDocument: the rule-based chunker drops \"as X\" after serve/stand entirely", () => {
    const dodge = analyzeReal("The building serves as a reminder of the city's heritage.");
    expect(detect(dodge)).toEqual([]); // would fire if clause.verb.modifiers carried the "as" PP — it never does today
    const legit = analyzeReal("The waiter serves as many tables as he can.");
    expect(detect(legit)).toEqual([]); // same parser gap; also correct for the right reason once the gap closes
  });

  it("the bare frame DOES fire through today's readDocument — plain transitive objects parse fine", () => {
    const dodge = analyzeReal("This documentary represents a turning point in independent filmmaking.");
    const findings = detect(dodge);
    expect(findings).toHaveLength(1);
    expect(textAt(dodge, findings[0]!.span)).toBe("represents");

    expect(detect(analyzeReal("The marks on the wall are ugly."))).toEqual([]);
    expect(detect(analyzeReal("The district is represented by the senator."))).toEqual([]);
  });
});

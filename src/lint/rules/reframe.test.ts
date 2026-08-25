// Tests for the negative-parallelism rule (#14), in two layers.
//
//   Structural   Clause IR hand-built as plain data and dropped into a stub DocAnalysis. The rule
//                is a predicate over the IR, so this tests exactly what it claims to test, with no
//                parser in the loop and nothing to go stale when the chunker changes.
//   End-to-end   Real text through readDocument, to pin what the shipped no-model path actually
//                catches today. These use UNCONTRACTED forms on purpose: "It's not bold." comes
//                back a fragment from the rule-based tagger (engine bug #31, not this rule's to
//                fix), so the contracted shapes are covered structurally above instead and will
//                start working end-to-end for free once #31 lands or a model parser is loaded.
//
// (When #12's fixture format lands, the fixture-shaped cases here are the ones to retrofit.)

import { describe, expect, test } from "vitest";
import type { Clause, Nominal, Word } from "../../ir.js";
import type { DocAnalysis, UnitAnalysis } from "../types.js";
import { readDocument } from "../../document.js";
import { runRules } from "../engine.js";
import { RULES, assertUniqueRuleIds } from "../registry.js";
import { makeDoc, wordSpans } from "../stub-doc.js";
import { textAt } from "../span.js";
import { reframeRule } from "./reframe.js";

// --- builders ---

const word = (text: string, pos?: string): Word => (pos === undefined ? { text } : { text, pos });
const nominal = (text: string, pos?: string): Nominal => ({ head: word(text, pos), modifiers: [] });

type Spec = {
  subj: string;
  subjPos?: string;
  verb?: string;
  neg?: boolean | "fused"; // true = a "not" modifier (PTB shape); "fused" = "isn't" baked into the head
  comp?: string;
  kind?: "predicateNoun" | "predicateAdj" | "directObject";
};

// One clause of plain IR data. Defaults make the common case short: copular, affirmative, with a
// predicate noun.
function clause(spec: Spec): Clause {
  const { subj, subjPos, verb = "is", neg, comp, kind = "predicateNoun" } = spec;
  const head = neg === "fused" ? word(`${verb}n't`, "VBZ") : word(verb, "VBZ");
  return {
    subject: nominal(subj, subjPos),
    verb: { head, modifiers: neg === true ? [{ kind: "word", value: word("not") }] : [] },
    complement:
      comp === undefined
        ? null
        : kind === "predicateAdj"
          ? { kind: "predicateAdj", value: word(comp, "JJ") }
          : { kind, value: nominal(comp, "NN") },
  };
}

// A stub DocAnalysis with hand-built clauses attached per unit. `null` for a unit leaves it
// unlowered (the honest state for anything nothing parsed).
function docOf(text: string, clausesByUnit: Array<Clause[] | null>): DocAnalysis {
  const doc = makeDoc(text, (_u, i) => (clausesByUnit[i] ? "lowered" : "fragment"));
  doc.units.forEach((u, i) => {
    const cs = clausesByUnit[i];
    if (cs) u.clauses = cs;
  });
  return doc;
}

// The end-to-end stand-in for #9's analyzeDocument (owned elsewhere): real units from the shipped
// splitter + parser, with word offsets scanned back out of the source.
const realDoc = (text: string): DocAnalysis => ({
  text,
  units: readDocument(text).map((u): UnitAnalysis => ({ ...u, words: wordSpans(text, u.span) })),
});

const detect = (doc: DocAnalysis) => reframeRule.detect(doc);
const spans = (doc: DocAnalysis) => detect(doc).map((f) => textAt(doc, f.span));

// --- the pattern, structurally ---

describe("the reframe, over hand-built IR", () => {
  test("catches the canonical two-sentence form", () => {
    const doc = docOf("It is not bold. It is backwards.", [
      [clause({ subj: "It", subjPos: "PRP", neg: true, comp: "bold", kind: "predicateAdj" })],
      [clause({ subj: "It", subjPos: "PRP", comp: "backwards", kind: "predicateAdj" })],
    ]);
    const found = detect(doc);
    expect(found).toHaveLength(1);
    expect(found[0]!.ruleId).toBe("reframe");
    expect(found[0]!.message).toContain("Negative parallelism");
    expect(found[0]!.message).toContain("“not bold”");
    expect(found[0]!.message).toContain("“backwards”");
  });

  test("span runs from the negation to the end of the second unit, and slices cleanly", () => {
    const doc = docOf("It is not bold. It is backwards.", [
      [clause({ subj: "It", subjPos: "PRP", neg: true, comp: "bold", kind: "predicateAdj" })],
      [clause({ subj: "It", subjPos: "PRP", comp: "backwards", kind: "predicateAdj" })],
    ]);
    expect(spans(doc)).toEqual(["not bold. It is backwards."]);
  });

  test("catches the contracted form (fused “isn't” head) — what #31 blocks end-to-end", () => {
    const doc = docOf("It isn't bold. It's backwards.", [
      [clause({ subj: "It", subjPos: "PRP", neg: "fused", comp: "bold", kind: "predicateAdj" })],
      [clause({ subj: "It", subjPos: "PRP", comp: "backwards", kind: "predicateAdj" })],
    ]);
    expect(spans(doc)).toEqual(["isn't bold. It's backwards."]);
  });

  test("catches a repeated head noun: “The question isn't X. The question is Y.”", () => {
    const doc = docOf("The question is not the cost. The question is the timeline.", [
      [clause({ subj: "question", subjPos: "NN", neg: true, comp: "cost" })],
      [clause({ subj: "question", subjPos: "NN", comp: "timeline" })],
    ]);
    expect(detect(doc)).toHaveLength(1);
  });

  test("case-insensitive head match: “Boldness is not X. boldness is Y.”", () => {
    const doc = docOf("Boldness is not the plan. boldness is the excuse.", [
      [clause({ subj: "Boldness", subjPos: "NN", neg: true, comp: "plan" })],
      [clause({ subj: "boldness", subjPos: "NN", comp: "excuse" })],
    ]);
    expect(detect(doc)).toHaveLength(1);
  });

  test("catches a full NP answered by a back-referring pronoun, across a semicolon", () => {
    // ";" is a unit boundary in both splitters, so this arrives as two adjacent units.
    const text = "The problem wasn't the code; it was your head.";
    const doc = docOf(text, [
      [clause({ subj: "problem", subjPos: "NN", verb: "was", neg: "fused", comp: "code" })],
      [clause({ subj: "it", subjPos: "PRP", verb: "was", comp: "head" })],
    ]);
    expect(doc.units).toHaveLength(2);
    expect(spans(doc)).toEqual(["wasn't the code; it was your head."]);
  });

  test("catches an adjacent pair inside ONE unit (the dash variant, once a parser lowers both halves)", () => {
    const text = "That isn't boldness — it's backwardness.";
    const doc = docOf(text, [
      [
        clause({ subj: "That", subjPos: "DT", neg: "fused", comp: "boldness" }),
        clause({ subj: "it", subjPos: "PRP", comp: "backwardness" }),
      ],
    ]);
    expect(doc.units).toHaveLength(1);
    expect(spans(doc)).toEqual(["isn't boldness — it's backwardness."]);
  });

  test("reports the lexical echo: the word denied is the word handed back", () => {
    const text = "It is not innovation. It is repackaging wearing the innovation label.";
    const doc = docOf(text, [
      [clause({ subj: "It", subjPos: "PRP", neg: true, comp: "innovation" })],
      [clause({ subj: "It", subjPos: "PRP", comp: "repackaging" })],
    ]);
    const found = detect(doc);
    expect(found).toHaveLength(1);
    expect(found[0]!.message).toContain("echoing “innovation”");
    expect(found[0]!.explanation).toContain("circular");
  });

  test("an in-unit pair needs TWO occurrences to count as an echo (one is the clause's own)", () => {
    const text = "That isn't boldness — it's caution.";
    const doc = docOf(text, [
      [
        clause({ subj: "That", subjPos: "DT", neg: "fused", comp: "boldness" }),
        clause({ subj: "it", subjPos: "PRP", comp: "caution" }),
      ],
    ]);
    expect(detect(doc)[0]!.message).not.toContain("echoing");
  });

  test("degrades to the unit span when the analysis carries no word offsets", () => {
    const text = "It is not bold. It is backwards.";
    const doc = docOf(text, [
      [clause({ subj: "It", subjPos: "PRP", neg: true, comp: "bold", kind: "predicateAdj" })],
      [clause({ subj: "It", subjPos: "PRP", comp: "backwards", kind: "predicateAdj" })],
    ]);
    doc.units.forEach((u) => (u.words = []));
    expect(spans(doc)).toEqual(["It is not bold. It is backwards."]);
  });
});

// --- what must NOT fire ---

describe("near misses", () => {
  const cases: Array<[string, string, Array<Clause[] | null>]> = [
    [
      "plain negation with no reframe after it",
      "It is not ready yet. The build starts at nine.",
      [
        [clause({ subj: "It", subjPos: "PRP", neg: true, comp: "ready", kind: "predicateAdj" })],
        [clause({ subj: "build", subjPos: "NN", verb: "starts" })],
      ],
    ],
    [
      "second clause also negated — two denials, no swap",
      "It is not bold. It is not brave.",
      [
        [clause({ subj: "It", subjPos: "PRP", neg: true, comp: "bold", kind: "predicateAdj" })],
        [clause({ subj: "It", subjPos: "PRP", neg: true, comp: "brave", kind: "predicateAdj" })],
      ],
    ],
    [
      "affirmative first, negated second — the reveal runs backwards",
      "It is bold. It is not backwards.",
      [
        [clause({ subj: "It", subjPos: "PRP", comp: "bold", kind: "predicateAdj" })],
        [clause({ subj: "It", subjPos: "PRP", neg: true, comp: "backwards", kind: "predicateAdj" })],
      ],
    ],
    [
      "second clause is not copular",
      "It is not ready. It runs the build.",
      [
        [clause({ subj: "It", subjPos: "PRP", neg: true, comp: "ready", kind: "predicateAdj" })],
        [clause({ subj: "It", subjPos: "PRP", verb: "runs", comp: "build", kind: "directObject" })],
      ],
    ],
    [
      "a be-verb with no predicate complement at all",
      "It is not here. It is there.",
      [
        [clause({ subj: "It", subjPos: "PRP", neg: true })],
        [clause({ subj: "It", subjPos: "PRP" })],
      ],
    ],
    [
      "a verb chain ending in a participle is not a copula",
      "It is not running. It is walking.",
      [
        [clause({ subj: "It", subjPos: "PRP", verb: "is running", neg: true, comp: "fast", kind: "predicateAdj" })],
        [clause({ subj: "It", subjPos: "PRP", verb: "is walking", comp: "slow", kind: "predicateAdj" })],
      ],
    ],
    [
      "different subjects, neither pronominal",
      "The sky is not blue. The grass is green.",
      [
        [clause({ subj: "sky", subjPos: "NN", neg: true, comp: "blue", kind: "predicateAdj" })],
        [clause({ subj: "grass", subjPos: "NN", comp: "green", kind: "predicateAdj" })],
      ],
    ],
    [
      "pronoun then full NP is cataphora, not the reframe",
      "It is not the code. The problem is your head.",
      [
        [clause({ subj: "It", subjPos: "PRP", neg: true, comp: "code" })],
        [clause({ subj: "problem", subjPos: "NN", comp: "head" })],
      ],
    ],
    [
      "first-person subject after a full NP is a different subject, not an anaphor",
      "The report was not a summary. I was furious.",
      [
        [clause({ subj: "report", subjPos: "NN", verb: "was", neg: true, comp: "summary" })],
        [clause({ subj: "I", subjPos: "PRP", verb: "was", comp: "furious", kind: "predicateAdj" })],
      ],
    ],
    [
      "the halves are not adjacent",
      "It is not bold. The team shipped it anyway. It is backwards.",
      [
        [clause({ subj: "It", subjPos: "PRP", neg: true, comp: "bold", kind: "predicateAdj" })],
        [clause({ subj: "team", subjPos: "NN", verb: "shipped", comp: "it", kind: "directObject" })],
        [clause({ subj: "It", subjPos: "PRP", comp: "backwards", kind: "predicateAdj" })],
      ],
    ],
    [
      "a unit that never lowered can't pair with anything",
      "It is not bold. It is backwards.",
      [[clause({ subj: "It", subjPos: "PRP", neg: true, comp: "bold", kind: "predicateAdj" })], null],
    ],
  ];

  test.each(cases)("does not fire: %s", (_name, text, clauses) => {
    expect(detect(docOf(text, clauses))).toEqual([]);
  });
});

// --- density ---

describe("severity scales with how often the document does it", () => {
  const pair = (subject: string, a: string, b: string): Array<Clause[]> => [
    [clause({ subj: subject, subjPos: "PRP", neg: true, comp: a, kind: "predicateAdj" })],
    [clause({ subj: subject, subjPos: "PRP", comp: b, kind: "predicateAdj" })],
  ];
  const sentence = (subject: string, a: string, b: string) => `${subject} is not ${a}. ${subject} is ${b}.`;

  test("one pair is style: low", () => {
    const doc = docOf(sentence("It", "bold", "backwards"), pair("It", "bold", "backwards"));
    const found = detect(doc);
    expect(found).toHaveLength(1);
    expect(found[0]!.severity).toBe("low");
    expect(found[0]!.explanation).not.toContain("times in this piece");
  });

  test("two pairs is a habit: medium", () => {
    const text = `${sentence("It", "bold", "backwards")} ${sentence("This", "safe", "slow")}`;
    const doc = docOf(text, [...pair("It", "bold", "backwards"), ...pair("This", "safe", "slow")]);
    const found = detect(doc);
    expect(found.map((f) => f.severity)).toEqual(["medium", "medium"]);
    expect(found[0]!.explanation).toContain("2 times in this piece");
  });

  test("three or more is the tell: high", () => {
    const text = [
      sentence("It", "bold", "backwards"),
      sentence("This", "safe", "slow"),
      sentence("That", "clever", "cheap"),
    ].join(" ");
    const doc = docOf(text, [
      ...pair("It", "bold", "backwards"),
      ...pair("This", "safe", "slow"),
      ...pair("That", "clever", "cheap"),
    ]);
    const found = detect(doc);
    expect(found).toHaveLength(3);
    expect(found.every((f) => f.severity === "high")).toBe(true);
    expect(found[0]!.explanation).toContain("3 times in this piece");
  });

  test("findings come back in document order", () => {
    const text = `${sentence("It", "bold", "backwards")} ${sentence("This", "safe", "slow")}`;
    const doc = docOf(text, [...pair("It", "bold", "backwards"), ...pair("This", "safe", "slow")]);
    const starts = detect(doc).map((f) => f.span.start);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
  });
});

// --- the because variant ---

describe("“not because X, but because Y”", () => {
  test("fires on the paired because-clauses", () => {
    const text = "He left not because he was tired, but because he was bored.";
    const doc = realDoc(text);
    const found = detect(doc);
    expect(found).toHaveLength(1);
    expect(found[0]!.message).toContain("not because");
    expect(textAt(doc, found[0]!.span)).toBe("not because he was tired, but because he was bored");
  });

  test("works from token shape alone, with nothing lowered", () => {
    // The IR drops the second because-clause in lowering, so this variant is read off the token
    // sequence — which means it still fires on a document nothing parsed.
    const text = "She stayed not because the pay was good, but because the work was hers.";
    expect(detect(makeDoc(text))).toHaveLength(1);
  });

  test("one span, one finding, when a unit matches both ways", () => {
    // The because-shape and an in-unit clause pair produce the SAME span (this unit's negation to
    // this unit's end). Reporting it twice would double the density count, so it is deduped.
    const text = "That isn't caution — it's fear, not because he is timid, but because he is wise";
    const doc = docOf(text, [
      [
        clause({ subj: "That", subjPos: "DT", neg: "fused", comp: "caution" }),
        clause({ subj: "it", subjPos: "PRP", comp: "fear" }),
      ],
    ]);
    const found = detect(doc);
    expect(found).toHaveLength(1);
    expect(found[0]!.severity).toBe("low");
  });

  test.each([
    ["a plain because-clause", "He left because he was bored."],
    ["a bare not-but contrast", "It is not a request, but an order."],
    ["because without the negation", "He left because he was tired, but because it rained he came back."],
    ["the two becauses without a but", "He left not because he was tired. He left because he was bored."],
  ])("does not fire on %s", (_name, text) => {
    expect(detect(makeDoc(text))).toEqual([]);
  });
});

// --- end to end, through the shipped no-model path ---

describe("end to end through readDocument", () => {
  test("two sentences: “This is not a rant. This is a diagnosis.”", () => {
    const text = "This is not a rant. This is a diagnosis.";
    const doc = realDoc(text);
    const found = detect(doc);
    expect(found).toHaveLength(1);
    // Unit spans from document.ts exclude the terminating period, so the span stops at "diagnosis".
    expect(textAt(doc, found[0]!.span)).toBe("not a rant. This is a diagnosis");
    expect(found[0]!.severity).toBe("low");
  });

  test("across a semicolon: “The problem was not the code; it was your head.”", () => {
    const text = "The problem was not the code; it was your head.";
    const doc = realDoc(text);
    expect(doc.units).toHaveLength(2);
    expect(detect(doc).map((f) => textAt(doc, f.span))).toEqual(["not the code; it was your head"]);
  });

  test("the echo shows up on real parses too", () => {
    const text = "It is not innovation. It is innovation wearing old clothes.";
    const found = detect(realDoc(text));
    expect(found).toHaveLength(1);
    expect(found[0]!.message).toContain("echoing “innovation”");
  });

  test("a full NP answered by “It”", () => {
    const text = "The report was not a summary. It was a warning.";
    expect(detect(realDoc(text))).toHaveLength(1);
  });

  test("three reframes in one document score high", () => {
    const text = [
      "This is not a rant. This is a diagnosis.",
      "The report was not a summary. It was a warning.",
      "The question is not the cost. The question is the timeline.",
    ].join(" ");
    const found = detect(realDoc(text));
    expect(found).toHaveLength(3);
    expect(found.every((f) => f.severity === "high")).toBe(true);
  });

  test.each([
    ["plain negation, nothing paired with it", "It is not ready yet."],
    ["different subjects", "The sky is not blue. The grass is green."],
    ["second clause not copular", "It is not ready. It runs the build."],
    ["no negation at all", "This is a rant. This is a diagnosis."],
    ["two denials", "It is not bold. It is not brave."],
    ["reversed order", "It is bold. It is not backwards."],
  ])("does not fire on %s", (_name, text) => {
    expect(detect(realDoc(text))).toEqual([]);
  });

  test("contracted copulas are a fragment on this path today (engine bug #31)", () => {
    // Documents the known gap rather than pretending it works: nothing lowers, so nothing fires.
    // The same sentences DO fire when the IR is present — see the structural tests above.
    const doc = realDoc("It's not bold. It's backwards.");
    expect(doc.units.map((u) => u.outcome)).toEqual(["fragment", "fragment"]);
    expect(detect(doc)).toEqual([]);
  });
});

// --- wiring ---

describe("registration", () => {
  test("is in the registry under the syntactic tier, with a unique id", () => {
    expect(RULES).toContain(reframeRule);
    expect(reframeRule.tier).toBe("syntactic");
    expect(() => assertUniqueRuleIds()).not.toThrow();
  });

  test("runs through the engine with spans the runner accepts", () => {
    const text = "This is not a rant. This is a diagnosis.";
    const { findings, errors } = runRules([reframeRule], realDoc(text));
    expect(errors).toEqual([]);
    expect(findings.map((f) => f.ruleId)).toEqual(["reframe"]);
  });
});

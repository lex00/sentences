// Tests for the negative-parallelism rule (#14), in two layers.
//
//   Structural   Clause IR hand-built as plain data and dropped into a stub DocAnalysis. The rule
//                is a predicate over the IR, so this tests exactly what it claims to test, with no
//                parser in the loop and nothing to go stale when the chunker changes.
//   End-to-end   Real text through readDocument, to pin what the shipped no-model path actually
//                catches today. Most of these use uncontracted forms; contracted copulas ("It's
//                not bold.") used to come back a fragment from the rule-based tagger (engine bug
//                #31) and are now covered end-to-end too, at the bottom of that block.
//
// (When #12's fixture format lands, the fixture-shaped cases here are the ones to retrofit.)

import { describe, expect, test } from "vitest";
import type { Clause, Modifier, Nominal, Word } from "../../ir.js";
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
  // true = a "not" modifier (PTB shape); "fused" = "isn't" baked into the head;
  // "never" = a bare "never" modifier (#34's temporal-absolute variant, never fused).
  neg?: boolean | "fused" | "never";
  adverb?: "always"; // a bare "always" modifier — #34's strong-bonus signal on the affirmative side
  comp?: string;
  kind?: "predicateNoun" | "predicateAdj" | "directObject";
  about?: string; // a verb-level "about X" prep modifier, complement left null — the about-PP shape
};

// One clause of plain IR data. Defaults make the common case short: copular, affirmative, with a
// predicate noun.
function clause(spec: Spec): Clause {
  const { subj, subjPos, verb = "is", neg, adverb, comp, kind = "predicateNoun", about } = spec;
  const head = neg === "fused" ? word(`${verb}n't`, "VBZ") : word(verb, "VBZ");
  const modifiers: Modifier[] = [];
  if (neg === true) modifiers.push({ kind: "word", value: word("not") });
  if (neg === "never") modifiers.push({ kind: "word", value: word("never") });
  if (adverb === "always") modifiers.push({ kind: "word", value: word("always") });
  if (about !== undefined) modifiers.push({ kind: "prep", prep: word("about"), object: nominal(about, "NN") });
  return {
    subject: nominal(subj, subjPos),
    verb: { head, modifiers },
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

// --- the temporal-absolute variant: "It was never X. It was always Y." (#34) ---

describe("“It was never X. It was always Y.”", () => {
  test("never (negated) + always (affirmative) fires as an ordinary pair, structurally", () => {
    const doc = docOf("It was never bold. It was always safe.", [
      [clause({ subj: "It", subjPos: "PRP", verb: "was", neg: "never", comp: "bold", kind: "predicateAdj" })],
      [clause({ subj: "It", subjPos: "PRP", verb: "was", adverb: "always", comp: "safe", kind: "predicateAdj" })],
    ]);
    const found = detect(doc);
    expect(found).toHaveLength(1);
    expect(found[0]!.message).toContain("“not bold”");
    expect(found[0]!.message).toContain("“safe”");
  });

  test("never + always gets one severity step up over the plain count-scaled severity", () => {
    // One pair alone would ordinarily be "low" (see the density tests above) — the never/always
    // bonus bumps it to "medium".
    const doc = docOf("It was never bold. It was always safe.", [
      [clause({ subj: "It", subjPos: "PRP", verb: "was", neg: "never", comp: "bold", kind: "predicateAdj" })],
      [clause({ subj: "It", subjPos: "PRP", verb: "was", adverb: "always", comp: "safe", kind: "predicateAdj" })],
    ]);
    expect(detect(doc)[0]!.severity).toBe("medium");
  });

  test("never + a plain affirmative (no \"always\") still fires, without the bump", () => {
    const doc = docOf("It was never bold. It was safe.", [
      [clause({ subj: "It", subjPos: "PRP", verb: "was", neg: "never", comp: "bold", kind: "predicateAdj" })],
      [clause({ subj: "It", subjPos: "PRP", verb: "was", comp: "safe", kind: "predicateAdj" })],
    ]);
    const found = detect(doc);
    expect(found).toHaveLength(1);
    expect(found[0]!.severity).toBe("low");
  });

  test("the about-PP form: complement is null, so isCopular alone would miss it", () => {
    // "It was never about the money" lowers with complement: null and "about the money" riding as a
    // verb modifier instead (see reframe.ts's isAboutPair doc comment) — this pins that shape.
    const a = clause({ subj: "It", subjPos: "PRP", verb: "was", neg: "never", about: "money" });
    expect(a.complement).toBeNull();
    const doc = docOf("It was never about the money. It was always about control.", [
      [a],
      [clause({ subj: "It", subjPos: "PRP", verb: "was", adverb: "always", about: "control" })],
    ]);
    const found = detect(doc);
    expect(found).toHaveLength(1);
    expect(found[0]!.message).toContain("“not money”");
    expect(found[0]!.message).toContain("“control”");
    expect(found[0]!.severity).toBe("medium"); // never + always bonus, same as the plain form
  });

  test("does not fire across non-coreferent subjects even with never/always both present", () => {
    const doc = docOf("It was never bold. That was always safe.", [
      [clause({ subj: "It", subjPos: "PRP", verb: "was", neg: "never", comp: "bold", kind: "predicateAdj" })],
      [clause({ subj: "problem", subjPos: "NN", verb: "was", adverb: "always", comp: "safe", kind: "predicateAdj" })],
    ]);
    expect(detect(doc)).toEqual([]);
  });

  test("does not fire on a non-copular \"never … always …\" pair (different verbs, different subjects)", () => {
    const doc = docOf("She never lies. He always exaggerates.", [
      [clause({ subj: "She", subjPos: "PRP", verb: "lies", neg: "never" })],
      [clause({ subj: "He", subjPos: "PRP", verb: "exaggerates", adverb: "always" })],
    ]);
    expect(detect(doc)).toEqual([]);
  });

  test("a lone \"never\" clause with nothing adjacent does not fire", () => {
    const doc = docOf("It was never finished.", [
      [clause({ subj: "It", subjPos: "PRP", verb: "was", neg: "never", comp: "finished", kind: "predicateAdj" })],
    ]);
    expect(detect(doc)).toEqual([]);
  });

  // --- the comma-spliced, same-sentence form ("It was never X, it was always Y.") ---
  //
  // The splitter (document.ts) does not treat "," as a unit boundary, so this arrives as ONE unit.
  // The real parser also does not lower it to two clauses (verified against readDocument — see the
  // end-to-end block below and reframe.ts's commaVariant doc comment), so there is no clause pair
  // for isReframePairAny to find; this is read off the unit's text instead, at "candidate" severity.
  describe("same-sentence comma variant, from token shape", () => {
    test("fires on \"never … , … always …\" with a copula present", () => {
      const text = "It was never about the money, it was always about control.";
      const found = detect(makeDoc(text));
      expect(found).toHaveLength(1);
      expect(found[0]!.severity).toBe("candidate");
      expect(textAt(makeDoc(text), found[0]!.span)).toBe("never about the money, it was always about control.");
    });

    test("does not fire without a comma between \"never\" and \"always\"", () => {
      const text = "It was never bold and it was always safe.";
      expect(detect(makeDoc(text))).toEqual([]);
    });

    test("does not fire without \"always\" on the other side of the comma", () => {
      const text = "It was never easy, but we managed.";
      expect(detect(makeDoc(text))).toEqual([]);
    });

    test("does not fire without a copula anywhere in the unit", () => {
      const text = "It never works, it always ships.";
      expect(detect(makeDoc(text))).toEqual([]);
    });
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

  // --- the temporal-absolute variant, through the real parser (#34) ---
  //
  // "never" lowers as a bare "word" modifier on the verb (never fused, unlike "n't" — see
  // ir-query.ts), so the two-sentence form is caught by the ordinary structural pair path, same as
  // the "not X. Y." forms above; only the severity differs (the never/always bonus).
  test("“It was never bold. It was always safe.” — real parse, never/always bonus applied", () => {
    const text = "It was never bold. It was always safe.";
    const doc = realDoc(text);
    const found = detect(doc);
    expect(found).toHaveLength(1);
    expect(textAt(doc, found[0]!.span)).toBe("never bold. It was always safe");
    expect(found[0]!.severity).toBe("medium"); // "low" base for a lone pair, bumped once
  });

  // "It was never about the money" lowers with complement: null and "about the money" as a verb
  // modifier (confirmed against the real parser) — isCopular alone misses this, which is what
  // isAboutPair in reframe.ts exists to catch.
  test("“It was never about X. It was always about Y.” — the about-PP arm, real parse", () => {
    const text = "It was never about the money. It was always about control.";
    const doc = realDoc(text);
    const found = detect(doc);
    expect(found).toHaveLength(1);
    expect(textAt(doc, found[0]!.span)).toBe("never about the money. It was always about control");
    expect(found[0]!.severity).toBe("medium");
  });

  // The owner's LinkedIn-slop example, comma-spliced into one sentence. Confirmed against the real
  // parser: this lowers to a SINGLE clause (the comma splice's own subject "it" ends up folded in as
  // a bare predicateNoun, and "always about control" is dropped entirely in lowering) — so there is
  // no clause pair here for isReframePairAny to find, and the comma-variant token-shape arm is what
  // catches it, at "candidate" severity.
  test("“It was never about X, it was always about Y.” — the comma-variant arm, real parse", () => {
    const text = "It was never about the money, it was always about control.";
    const doc = realDoc(text);
    expect(doc.units).toHaveLength(1);
    expect(doc.units[0]!.clauses).toHaveLength(1); // pins the single-clause lowering this arm exists for
    const found = detect(doc);
    expect(found).toHaveLength(1);
    expect(found[0]!.severity).toBe("candidate");
    expect(textAt(doc, found[0]!.span)).toBe("never about the money, it was always about control");
  });

  test.each([
    ["a lone \"never\" clause, nothing adjacent", "It was never finished."],
    ["different subjects, neither copular", "She never lies. He always exaggerates."],
    ["\"never\" paired with a non-copular affirmative clause", "It was never easy, but we managed."],
  ])("temporal-absolute variant does not fire on %s", (_name, text) => {
    expect(detect(realDoc(text))).toEqual([]);
  });

  test("contracted copulas fire end-to-end now that the tagger keeps them (engine bug #31)", () => {
    // Was pinned as a gap: the rule-based tagger dropped the zero-width "'s" term, so both units
    // came back "fragment" and nothing fired. tagger.ts now restores the clitic as "is".
    const doc = realDoc("It's not bold. It's backwards.");
    expect(doc.units.map((u) => u.outcome)).toEqual(["lowered", "lowered"]);
    const found = detect(doc);
    expect(found).toHaveLength(1);
    expect(textAt(doc, found[0]!.span)).toBe("not bold. It's backwards");
  });

  test("a fused “isn't” answered by an anaphor: “Growth isn't a destination. It's a journey.”", () => {
    // The n't-fused be-form stays fused in the verb head (tagger.ts, #31), so lower.ts has to
    // strip the "n't" before its copula test or "a destination" classifies as a DIRECT OBJECT and
    // isCopular's complement check fails — which is what used to leave this pair unfound.
    const doc = realDoc("Growth isn't a destination. It's a journey.");
    const first = doc.units[0]!.clauses![0]!;
    expect(first.complement?.kind).toBe("predicateNoun");
    const found = detect(doc);
    expect(found).toHaveLength(1);
    expect(textAt(doc, found[0]!.span)).toBe("isn't a destination. It's a journey");
    expect(found[0]!.message).toContain("“not destination” answered by “journey”");
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

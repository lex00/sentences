import { describe, it, expect } from "vitest";
import { tricolonRule } from "./tricolon.js";
import { lower } from "../../lower.js";
import type { Clause, Compound, Complement, Nominal, Predicate, PredicatePart, Subject, Verbal, Word } from "../../ir.js";
import type { DocAnalysis, Span, UnitAnalysis } from "../types.js";

// --- fixture builders ---
// Most fixtures below are hand-built Clause IR (plain data, per the issue's guidance) rather than
// run through the real parser: lowerCoordNP (lower.ts) needs a well-formed constituency tree to
// produce a genuine N-item Compound, and the rule-based chunker (src/nlp/parse.ts) that readDocument
// uses does not reliably build one from raw comma-separated text (it merges conjuncts into one
// head instead of splitting them — a known parser-seam limitation, not something this rule can
// paper over). Two integration tests near the bottom go through lower() on a hand-built PTB tree
// instead, to prove the walker also works against the IR shape the real pipeline actually emits.

const word = (text: string): Word => ({ text });
const nominal = (text: string): Nominal => ({ head: word(text), modifiers: [] });
const verbal = (text: string): Verbal => ({ head: word(text), modifiers: [] });

const compoundNominal = (n: number, prefix = "item"): Compound<Nominal> => ({
  items: Array.from({ length: n }, (_, i) => nominal(`${prefix}${i + 1}`)),
  conjunction: word("and"),
});
const compoundWord = (n: number, prefix = "adj"): Compound<Word> => ({
  items: Array.from({ length: n }, (_, i) => word(`${prefix}${i + 1}`)),
  conjunction: word("and"),
});
const compoundPredicate = (n: number, complement: Complement | null = null): Compound<PredicatePart> => ({
  items: Array.from({ length: n }, (_, i) => ({ verb: verbal(`verb${i + 1}`), complement: i === 0 ? complement : null })),
  conjunction: word("and"),
});

const clause = (subject: Subject, verb: Predicate, complement: Complement | null = null): Clause => ({ subject, verb, complement });

// Lays out units back to back with a single space between, computing honest offsets — the exact
// text doesn't matter to this rule (it only reads .clauses and, for a finding, the enclosing
// unit's .span), but real, non-overlapping, in-bounds spans do (the engine drops out-of-range ones).
function docOf(units: Array<{ text: string; clauses?: Clause[] }>): DocAnalysis {
  const docUnits: UnitAnalysis[] = [];
  let cursor = 0;
  const parts: string[] = [];
  for (const u of units) {
    const span: Span = { start: cursor, end: cursor + u.text.length };
    docUnits.push({
      unit: u.text,
      span,
      outcome: u.clauses ? "lowered" : "unparseable",
      ...(u.clauses ? { clauses: u.clauses } : { reason: "no clauses in this fixture" }),
      words: [],
    });
    parts.push(u.text);
    cursor = span.end + 1;
  }
  return { text: parts.join(" "), units: docUnits };
}

const detect = (doc: DocAnalysis) => tricolonRule.detect(doc);

// --- threshold: a single tricolon is ordinary rhetoric ---

describe("tricolon/density — a lone triple is clean", () => {
  it("one 3-item compound subject: no finding", () => {
    const doc = docOf([{ text: "three ran fast", clauses: [clause(compoundNominal(3), verbal("ran"))] }]);
    expect(detect(doc)).toEqual([]);
  });

  it("a unit with no clauses (fragment/unparseable) is skipped, not thrown on", () => {
    const doc = docOf([{ text: "Not a bug." }]);
    expect(detect(doc)).toEqual([]);
  });
});

// --- document-level density: 3+ tricolons anywhere in the document ---

describe("tricolon/document-density", () => {
  it("two 3-item compounds across the document: still clean", () => {
    const doc = docOf([
      { text: "a", clauses: [clause(compoundNominal(3), verbal("ran"))] },
      { text: "b", clauses: [clause(nominal("He"), verbal("bought"), { kind: "directObject", value: compoundNominal(3, "thing") })] },
    ]);
    expect(detect(doc)).toEqual([]);
  });

  it("three 3-item compounds across the document: fires one document-level finding", () => {
    const c1 = clause(compoundNominal(3), verbal("ran"));
    const c2 = clause(nominal("He"), verbal("bought"), { kind: "directObject", value: compoundNominal(3, "thing") });
    const c3 = clause(nominal("She"), compoundPredicate(3));
    const doc = docOf([
      { text: "a", clauses: [c1] },
      { text: "b", clauses: [c2] },
      { text: "c", clauses: [c3] },
    ]);
    const findings = detect(doc);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.ruleId).toBe("tricolon/document-density");
    expect(findings[0]!.message).toContain("3 rule-of-three");
    expect(findings[0]!.span).toEqual({ start: 0, end: doc.text.length }); // whole document, by design
  });

  it("counts a 4-item compound toward the document total too", () => {
    const c1 = clause(compoundNominal(3), verbal("ran"));
    const c2 = clause(nominal("He"), verbal("bought"), { kind: "directObject", value: compoundNominal(3, "thing") });
    const c3 = clause(nominal("She"), verbal("wore"), { kind: "predicateAdj", value: compoundWord(4) }); // 4-item, also fires its own finding
    const doc = docOf([
      { text: "a", clauses: [c1] },
      { text: "b", clauses: [c2] },
      { text: "c", clauses: [c3] },
    ]);
    const findings = detect(doc);
    const ruleIds = findings.map((f) => f.ruleId);
    expect(ruleIds).toContain("tricolon/document-density");
    expect(ruleIds).toContain("tricolon/density"); // the 4-item compound's own finding
    expect(findings).toHaveLength(2);
  });
});

// --- 4-5 item compounds fire individually, regardless of document density ---

describe("tricolon/density — large compounds fire on their own", () => {
  it("a 4-item direct object fires by itself (document total is only 1)", () => {
    const doc = docOf([{ text: "she bought many things", clauses: [clause(nominal("She"), verbal("bought"), { kind: "directObject", value: compoundNominal(4, "thing") })] }]);
    const findings = detect(doc);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.ruleId).toBe("tricolon/density");
    expect(findings[0]!.severity).toBe("medium");
    expect(findings[0]!.message).toContain("4-item list");
    expect(findings[0]!.span).toEqual(doc.units[0]!.span); // degrades to the unit span — Compound IR carries no offsets
  });

  it("a 5-item compound gets the higher severity", () => {
    const doc = docOf([{ text: "she bought many things", clauses: [clause(nominal("She"), verbal("bought"), { kind: "directObject", value: compoundNominal(5, "thing") })] }]);
    const findings = detect(doc);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe("high");
    expect(findings[0]!.message).toContain("5-item list");
  });
});

// --- the walker reaches every compound-bearing slot in the Clause IR ---

describe("tricolon/density — walker coverage", () => {
  it("finds a compound predicate (Compound<PredicatePart>)", () => {
    const doc = docOf([{ text: "she runs jumps and swims fast", clauses: [clause(nominal("She"), compoundPredicate(4))] }]);
    expect(detect(doc)[0]!.message).toContain("4-item list");
  });

  it("finds a compound inside a compound predicate's own complement (recursion into PredicatePart.complement)", () => {
    const nested = compoundPredicate(2, { kind: "directObject", value: compoundNominal(4, "book") });
    const doc = docOf([{ text: "he writes novels poems essays and teaches", clauses: [clause(nominal("He"), nested)] }]);
    const findings = detect(doc);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toContain("4-item list");
  });

  it("finds a predicateNoun compound", () => {
    const doc = docOf([{ text: "they are teachers coaches mentors and friends", clauses: [clause(nominal("They"), verbal("are"), { kind: "predicateNoun", value: compoundNominal(4, "role") })] }]);
    expect(detect(doc)[0]!.message).toContain("4-item list");
  });

  it("finds a predicateAdj compound (Compound<Word>)", () => {
    const doc = docOf([{ text: "it is tiny loud bright and cheap", clauses: [clause(nominal("It"), verbal("is"), { kind: "predicateAdj", value: compoundWord(4) })] }]);
    expect(detect(doc)[0]!.message).toContain("4-item list");
  });

  it("finds an objectComplement's object compound", () => {
    const c: Clause = clause(nominal("They"), verbal("elected"), { kind: "objectComplement", object: compoundNominal(4, "candidate"), oc: nominal("captain"), ocIsAdj: false });
    const doc = docOf([{ text: "they elected four people captain", clauses: [c] }]);
    expect(detect(doc)[0]!.message).toContain("4-item list");
  });

  it("recurses into a relative clause modifier to find a nested compound", () => {
    const nestedClause = clause(nominal("which"), verbal("includes"), { kind: "directObject", value: compoundNominal(4, "member") });
    const teamNominal: Nominal = { head: word("team"), modifiers: [{ kind: "clause", connector: word(""), value: nestedClause }] };
    const doc = docOf([{ text: "the team which includes four people won", clauses: [clause(teamNominal, verbal("won"))] }]);
    const findings = detect(doc);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toContain("4-item list");
  });

  it("recurses into a subject that is itself a whole clause", () => {
    const inner = clause(nominal("Whoever"), verbal("picks"), { kind: "directObject", value: compoundNominal(4, "fruit") });
    const outer = clause(inner, verbal("wins")); // Subject includes Clause — a clause used nominally
    const doc = docOf([{ text: "whoever picks four fruits wins", clauses: [outer] }]);
    const findings = detect(doc);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toContain("4-item list");
  });

  it("recurses into an absolute phrase's modifiers", () => {
    const nestedClause = clause(nominal("which"), verbal("includes"), { kind: "directObject", value: compoundNominal(4, "guest") });
    const absolute: Nominal = { head: word("doors"), modifiers: [{ kind: "clause", connector: word(""), value: nestedClause }] };
    const c: Clause = { subject: nominal("the room"), verb: verbal("felt bright"), complement: null, absolutes: [absolute] };
    const doc = docOf([{ text: "doors open the room felt bright", clauses: [c] }]);
    const findings = detect(doc);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toContain("4-item list");
  });
});

// --- real integration: the actual parse -> lower pipeline, via a hand-built PTB tree ---
// (the rule-based chunker behind readDocument can't reliably build a real N-item Compound from
// raw text — see the file header comment — so these go straight through lower() on a tree shaped
// the way lowerCoordNP expects, the same technique ir-query.test.ts uses for shapes parse.ts can't
// reach.)

describe("tricolon/density — through the real lower() pipeline", () => {
  it("a hand-built 3-item subject compound is clean alone", () => {
    const tree = "(S (NP (NP (DT The) (NN cat)) (, ,) (NP (DT the) (NN dog)) (, ,) (CC and) (NP (DT the) (NN bird))) (VP (VBD ran)))";
    const c = lower(tree);
    expect("items" in c.subject && c.subject.items.length).toBe(3);
    const doc = docOf([{ text: "The cat, the dog, and the bird ran.", clauses: [c] }]);
    expect(detect(doc)).toEqual([]);
  });

  it("a hand-built 4-item direct-object compound fires individually", () => {
    const tree =
      "(S (NP (PRP She)) (VP (VBD bought) (NP (NP (NNS apples)) (, ,) (NP (NNS bananas)) (, ,) (NP (NNS cherries)) (, ,) (CC and) (NP (NNS dates)))))";
    const c = lower(tree);
    const doc = docOf([{ text: "She bought apples, bananas, cherries, and dates.", clauses: [c] }]);
    const findings = detect(doc);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.ruleId).toBe("tricolon/density");
    expect(findings[0]!.message).toContain("4-item list");
  });
});

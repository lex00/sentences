import { describe, it, expect } from "vitest";
import { falseRangeRule } from "./false-range.js";
import { runRules } from "../engine.js";
import { makeDoc, spanOf, wordSpans } from "../stub-doc.js";
import { textAt } from "../span.js";
import { readDocument } from "../../document.js";
import { RULES } from "../registry.js";
import type { Clause, Nominal, Verbal } from "../../ir.js";
import type { DocAnalysis, UnitAnalysis } from "../types.js";

// --- test helpers ---

const w = (text: string, pos?: string) => ({ text, ...(pos ? { pos } : {}) });
const nom = (text: string, pos?: string): Nominal => ({ head: w(text, pos), modifiers: [] });

// A verb with a chain of prep modifiers: pairs like ["from", nom("innovation")], ["to", nom("implementation")], ...
function verbWithPreps(head: string, preps: Array<[string, Nominal]>): Verbal {
  return { head: w(head), modifiers: preps.map(([prep, object]) => ({ kind: "prep" as const, prep: w(prep), object })) };
}

function clauseWithVerb(subject: string, verb: Verbal): Clause {
  return { subject: nom(subject), verb, complement: null };
}

// Real DocAnalysis (word spans + hand-built clauses), matching what a rule actually receives:
// UnitAnalysis always carries `words`, whether or not a real parse ran.
function irDoc(text: string, clauses: Clause[]): DocAnalysis {
  const stub = makeDoc(text, "lowered");
  const units: UnitAnalysis[] = stub.units.map((u, i) => (i === 0 ? { ...u, clauses } : u));
  return { text, units };
}

// The real end-to-end path: the rule-based parser's own lowering, plus the word spans a real
// UnitAnalysis would carry alongside it (readDocument returns DocUnit[], which lacks `words`).
function realDoc(text: string): DocAnalysis {
  const units: UnitAnalysis[] = readDocument(text).map((u) => ({ ...u, words: wordSpans(text, u.span) }));
  return { text, units };
}

describe("false-range — IR path, real parser (readDocument cooperates)", () => {
  it("flags a chained false range and upgrades via heuristics (abstract suffixes + 3-item chain + no shared dimension)", () => {
    const text = "It moved from innovation to implementation to cultural transformation.";
    const doc = realDoc(text);
    const findings = falseRangeRule.detect(doc);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe("medium");
    expect(textAt(doc, findings[0]!.span)).toBe("from innovation to implementation to cultural transformation");
    expect(findings[0]!.ruleId).toBe("false-range/from-to");
  });

  it("flags the Big Bang / cosmic web false range at upgraded (low) severity via the no-shared-dimension heuristic", () => {
    const text = "It runs from the singularity of the Big Bang to the grand cosmic web.";
    const doc = realDoc(text);
    const findings = falseRangeRule.detect(doc);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe("low");
    expect(textAt(doc, findings[0]!.span)).toBe("from the singularity of the Big Bang to the grand cosmic web");
  });

  it("stays clean on a literal numeric range spelled out in words (nine to five)", () => {
    const doc = realDoc("She works from nine to five.");
    expect(falseRangeRule.detect(doc)).toEqual([]);
  });

  it("stays clean on a literal numeric range written as digits (9 to 5, the idiom)", () => {
    const doc = realDoc("She works from 9 to 5.");
    expect(falseRangeRule.detect(doc)).toEqual([]);
  });

  it("stays clean on a place-to-place range (proper nouns)", () => {
    const doc = realDoc("We drove from Boston to New York.");
    expect(falseRangeRule.detect(doc)).toEqual([]);
  });

  it("stays clean on known idioms: time to time, top to bottom, start to finish", () => {
    expect(falseRangeRule.detect(realDoc("It changed from time to time."))).toEqual([]);
    expect(falseRangeRule.detect(realDoc("The list goes from top to bottom."))).toEqual([]);
    expect(falseRangeRule.detect(realDoc("This process runs from start to finish."))).toEqual([]);
  });

  it("finds nothing in prose with no from/to range at all", () => {
    const doc = realDoc("The dog chased the ball across the yard.");
    expect(falseRangeRule.detect(doc)).toEqual([]);
  });
});

describe("false-range — IR path, hand-built Clause fixtures", () => {
  it("pairs a from-PP with a to-PP in the same modifier list and starts at candidate when no heuristic fires", () => {
    // "bottom" is a recognized DIMENSION_WORDS entry, so the no-shared-dimension heuristic (H3)
    // does not fire; "cabinet" isn't abstract-suffixed (H1 needs both ends); there are only 2
    // items (H2 needs 3+). Zero heuristics hit -> plain candidate.
    const text = "It moves from a cabinet to the bottom.";
    const clause = clauseWithVerb("It", verbWithPreps("moves", [["from", nom("cabinet")], ["to", nom("bottom")]]));
    const doc = irDoc(text, [clause]);
    const findings = falseRangeRule.detect(doc);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe("candidate");
    expect(textAt(doc, findings[0]!.span)).toBe("from a cabinet to the bottom");
  });

  it("upgrades to low when only the no-shared-dimension heuristic fires", () => {
    const text = "It moves from confusion to velocity.";
    const clause = clauseWithVerb("It", verbWithPreps("moves", [["from", nom("confusion")], ["to", nom("velocity")]]));
    const doc = irDoc(text, [clause]);
    const findings = falseRangeRule.detect(doc);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe("low"); // neither end abstract-suffixed together, only 2 items, but no shared dimension
  });

  it("upgrades to medium with a 4-item enumerated chain (recovers the coordinated-object trope example structurally)", () => {
    // Stands in for "from problem-solving and tool-making to scientific discovery, artistic
    // expression, and technological innovation" — the real chunker truncates this sentence (see
    // the token-path test below for that), so this fixture pins the heuristic logic directly.
    const text =
      "It runs from problem-solving to scientific discovery to artistic expression to technological innovation.";
    const clause = clauseWithVerb(
      "It",
      verbWithPreps("runs", [
        ["from", nom("problem-solving")],
        ["to", { head: w("discovery"), modifiers: [{ kind: "word", value: w("scientific") }] }],
        ["to", { head: w("expression"), modifiers: [{ kind: "word", value: w("artistic") }] }],
        ["to", { head: w("innovation"), modifiers: [{ kind: "word", value: w("technological") }] }],
      ]),
    );
    const doc = irDoc(text, [clause]);
    const findings = falseRangeRule.detect(doc);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe("medium"); // 3+ items, no shared dimension (suffix heuristic doesn't need to fire)
    expect(textAt(doc, findings[0]!.span)).toBe(
      "from problem-solving to scientific discovery to artistic expression to technological innovation",
    );
  });

  it("is suppressed by a CD-tagged numeric end even when the tagger disagrees on the other end's POS", () => {
    const text = "It runs from 9 to nine hundred.";
    const clause = clauseWithVerb(
      "It",
      verbWithPreps("runs", [
        ["from", nom("9", "CD")],
        ["to", nom("hundred")],
      ]),
    );
    const doc = irDoc(text, [clause]);
    expect(falseRangeRule.detect(doc)).toEqual([]);
  });

  it("is suppressed by an NNP-tagged proper-noun end", () => {
    const text = "It moves from happiness to Cleveland.";
    const clause = clauseWithVerb(
      "It",
      verbWithPreps("moves", [
        ["from", nom("happiness")],
        ["to", nom("Cleveland", "NNP")],
      ]),
    );
    const doc = irDoc(text, [clause]);
    expect(falseRangeRule.detect(doc)).toEqual([]);
  });

  it("finds a from-PP whose OWN object's modifiers hold the matching to-PP (nested neighborhood)", () => {
    // The "to" is not a sibling of "from" in the same modifier list — it hangs off the from-PP's
    // own object ("state"), per the issue's explicit "or the from-PP's object's modifiers" clause.
    const text = "It shows a shift from a state ranging to chaos entirely.";
    const fromObject: Nominal = {
      head: w("state"),
      modifiers: [{ kind: "prep", prep: w("to"), object: nom("chaos") }],
    };
    const clause: Clause = {
      subject: nom("It"),
      verb: { head: w("shows"), modifiers: [{ kind: "prep", prep: w("from"), object: fromObject }] },
      complement: null,
    };
    const doc = irDoc(text, [clause]);
    const findings = falseRangeRule.detect(doc);
    expect(findings).toHaveLength(1);
    expect(textAt(doc, findings[0]!.span)).toBe("from a state ranging to chaos");
  });

  it("does not throw when a from-PP and an unrelated to-PP live in separate, non-nested modifier lists", () => {
    // The nested "from doubt" (on the complement's own object) and the sibling "to certainty" (on
    // the verb) are in two unconnected modifier lists — neither the same-list nor the
    // from-object's-own-modifiers neighborhood applies, so this must not spuriously pair them.
    const nestedFromObject: Nominal = {
      head: w("mood"),
      modifiers: [{ kind: "prep", prep: w("from"), object: nom("doubt") }],
    };
    const clause: Clause = {
      subject: nom("It"),
      verb: { head: w("shows"), modifiers: [{ kind: "prep", prep: w("to"), object: nom("certainty") }] },
      complement: { kind: "directObject", value: nestedFromObject },
    };
    const doc = irDoc("It shows a mood from doubt nested to certainty structured.", [clause]);
    expect(() => falseRangeRule.detect(doc)).not.toThrow();
    // The token path still sees the literal "from ... to ..." word pattern here (it has no
    // structure to consult) and reports it — always at "candidate". What this test actually pins
    // is that the IR walker itself does not manufacture a confirmed, heuristic-upgradeable pairing
    // out of two modifier lists that aren't each other's neighborhood.
    const findings = falseRangeRule.detect(doc);
    expect(findings.every((f) => f.severity === "candidate")).toBe(true);
  });
});

describe("false-range — token path (no clauses / parser gave up)", () => {
  it("flags an abstract from/to pair from word shape alone, always at candidate severity", () => {
    const doc = makeDoc("It goes from confusion to clarity of purpose eventually.");
    const findings = falseRangeRule.detect(doc);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe("candidate");
    expect(findings[0]!.ruleId).toBe("false-range/from-to");
  });

  it("never upgrades past candidate even when the range would qualify under the IR heuristics", () => {
    // Same abstract-suffix, no-shared-dimension shape as an IR fixture that reaches "low" above —
    // here, with no clauses at all, it must stay "candidate".
    const doc = makeDoc("It moves from confusion to velocity across the board.");
    const findings = falseRangeRule.detect(doc);
    expect(findings.map((f) => f.severity)).toEqual(["candidate"]);
  });

  it("stays clean on a numeric range", () => {
    expect(falseRangeRule.detect(makeDoc("Support runs from nine to five most days."))).toEqual([]);
  });

  it("stays clean on a place-to-place range", () => {
    expect(falseRangeRule.detect(makeDoc("We drove from Boston to New York for the weekend."))).toEqual([]);
  });

  it("stays clean on a known idiom", () => {
    expect(falseRangeRule.detect(makeDoc("It changed from time to time without warning."))).toEqual([]);
  });

  it("does not fire past a modest token window — a stray unrelated 'to' far away is not a pair", () => {
    const filler = Array.from({ length: 20 }, (_, i) => `filler${i}`).join(" ");
    const doc = makeDoc(`It starts from confusion ${filler} goes to velocity.`);
    // "from" and "to" are 20+ words apart, well past MAX_GAP (16) — no pairing.
    expect(falseRangeRule.detect(doc)).toEqual([]);
  });

  it("locates the span exactly via spanOf", () => {
    const text = "It goes from confusion to clarity of purpose eventually.";
    const doc = makeDoc(text);
    const findings = falseRangeRule.detect(doc);
    expect(findings[0]!.span).toEqual(spanOf(text, "from confusion to clarity of purpose eventually"));
  });
});

describe("false-range — IR and token paths don't double-report the same phrase", () => {
  it("suppresses an overlapping token-path candidate once the IR path already found the range", () => {
    const text = "It moves from confusion to velocity.";
    const clause = clauseWithVerb("It", verbWithPreps("moves", [["from", nom("confusion")], ["to", nom("velocity")]]));
    const doc = irDoc(text, [clause]);
    const findings = falseRangeRule.detect(doc);
    // Exactly one finding for the whole unit, not one from each path.
    expect(findings).toHaveLength(1);
  });
});

describe("false-range — registered and wired into the engine", () => {
  it("is present in the registry under the syntactic tier", () => {
    expect(RULES.some((r) => r.id === "false-range/from-to")).toBe(true);
  });

  it("runs cleanly through runRules end to end", () => {
    const doc = realDoc("It moved from innovation to implementation to cultural transformation.");
    const { findings, errors } = runRules(RULES, doc);
    expect(errors).toEqual([]);
    expect(findings.some((f) => f.ruleId === "false-range/from-to")).toBe(true);
  });

  it("every finding carries a message and a longer, teaching explanation", () => {
    const doc = realDoc("It moved from innovation to implementation to cultural transformation.");
    for (const f of falseRangeRule.detect(doc)) {
      expect(f.message.length).toBeGreaterThan(0);
      expect(f.explanation.length).toBeGreaterThan(f.message.length);
    }
  });
});

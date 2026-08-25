// Tests for the selection half of diagram-the-finding (#26): given a finding, which marks of the
// diagram carry the tell. Everything here runs in node against stub TextMetrics — the point of
// splitting selection from painting is that the interesting half needs no canvas.

import { describe, expect, test } from "vitest";
import type { Clause, Nominal, Word } from "../ir.js";
import type { DocAnalysis, Finding, UnitAnalysis } from "../lint/types.js";
import type { TextMetrics } from "../layout.js";
import type { WordElement } from "../inspect.js";
import { makeDoc, spanOf, wordSpans } from "../lint/stub-doc.js";
import { readDocument } from "../document.js";
import { reframeRule } from "../lint/rules/reframe.js";
import { buildFindingDiagram } from "./diagram-finding-map.js";

// Deterministic metrics, matching every other layout test in the repo — no font file involved.
const metrics: TextMetrics = { measure: (t, sz) => ({ width: t.length * sz * 0.55, ascent: sz * 0.8, descent: sz * 0.2 }) };

// --- IR builders (same shape as lint/rules/reframe.test.ts, so the fixtures read alike) ---

const word = (text: string, pos?: string): Word => (pos === undefined ? { text } : { text, pos });
const nominal = (text: string, pos?: string): Nominal => ({ head: word(text, pos), modifiers: [] });

type Spec = {
  subj: string;
  verb?: string;
  neg?: boolean | "fused";
  comp?: string;
  kind?: "predicateNoun" | "predicateAdj" | "directObject";
};

function clause(spec: Spec): Clause {
  const { subj, verb = "is", neg, comp, kind = "predicateAdj" } = spec;
  const head = neg === "fused" ? word(`${verb}n't`, "VBZ") : word(verb, "VBZ");
  return {
    subject: nominal(subj, "PRP"),
    verb: { head, modifiers: neg === true ? [{ kind: "word", value: word("not") }] : [] },
    complement:
      comp === undefined
        ? null
        : kind === "predicateAdj"
          ? { kind: "predicateAdj", value: word(comp, "JJ") }
          : { kind, value: nominal(comp, "NN") },
  };
}

function docOf(text: string, clausesByUnit: Array<Clause[] | null>): DocAnalysis {
  const doc = makeDoc(text, (_u, i) => (clausesByUnit[i] ? "lowered" : "fragment"));
  doc.units.forEach((u, i) => {
    const cs = clausesByUnit[i];
    if (cs) attach(u, cs, doc.text);
  });
  return doc;
}

function attach(u: UnitAnalysis, clauses: Clause[], text: string): void {
  u.clauses = clauses;
  u.words = wordSpans(text, u.span);
}

const finding = (ruleId: string, span: { start: number; end: number }): Finding => ({
  ruleId,
  span,
  severity: "medium",
  message: "test finding",
  explanation: "test explanation",
});

const litWords = (d: { highlight: { words: string[] } }): string[] => d.highlight.words;

describe("the reframe — the acceptance case", () => {
  // "It is not bold. It is backwards." — two units, one copular clause each, the first negated.
  const TEXT = "It is not bold. It is backwards.";
  const doc = docOf(TEXT, [
    [clause({ subj: "It", neg: true, comp: "bold" })],
    [clause({ subj: "It", comp: "backwards" })],
  ]);
  const f = finding("reframe", { start: TEXT.indexOf("not"), end: TEXT.length });

  const built = buildFindingDiagram(doc, f, metrics);
  if (!built.ok) throw new Error(built.reason);
  const { diagram } = built;

  test("renders both sentences, stacked as two clauses", () => {
    expect(diagram.units).toHaveLength(2);
    expect(diagram.clausePrefixes).toEqual(["c0", "c1"]);
    // stacked, not side by side: the two baselines sit at different heights.
    const baselineYs = new Set(
      diagram.elements.filter((e) => e.kind === "line" && e.roleKey === "divider.full").map((e) => (e.kind === "line" ? e.a.y : 0)),
    );
    expect(baselineYs.size).toBe(2);
  });

  test("uses the reframe mapping, not the span fallback", () => {
    expect(diagram.highlight.strategy).toBe("reframe");
  });

  test("lights the negation and BOTH complements", () => {
    const words = litWords(diagram);
    expect(words).toContain("not");
    expect(words).toContain("bold");
    expect(words).toContain("backwards");
  });

  test("lights both copulas", () => {
    expect(litWords(diagram).filter((w) => w === "is")).toHaveLength(2);
  });

  test("marks the complement divider on both baselines, so the mirroring is visible", () => {
    const leans = diagram.highlight.elements.filter((e) => e.kind === "line" && e.roleKey === "divider.lean");
    expect(leans).toHaveLength(2);
  });

  test("leaves the subjects alone — the pattern is in the predicates", () => {
    expect(litWords(diagram)).not.toContain("It");
  });

  test("names the scene nodes it derived the highlight from", () => {
    expect(diagram.highlight.nodeIds).toContain("c0");
    expect(diagram.highlight.nodeIds).toContain("c1");
    // every lit element belongs to one of them
    for (const id of diagram.highlight.elementIds) expect(id).toMatch(/^c[01]/);
  });
});

describe("the reframe, contracted", () => {
  // "That isn't boldness. That is backwardness." — the negation is fused into the verb head, so
  // the negation mark IS the copula mark.
  const TEXT = "That isn't boldness. That is backwardness.";
  const doc = docOf(TEXT, [
    [clause({ subj: "That", neg: "fused", comp: "boldness", kind: "predicateNoun" })],
    [clause({ subj: "That", comp: "backwardness", kind: "predicateNoun" })],
  ]);
  const built = buildFindingDiagram(doc, finding("reframe", { start: 5, end: TEXT.length }), metrics);

  test("lights the fused negation as the verb head", () => {
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.diagram.highlight.strategy).toBe("reframe");
    expect(litWords(built.diagram)).toContain("isn't");
    expect(litWords(built.diagram)).toEqual(expect.arrayContaining(["boldness", "backwardness"]));
  });
});

describe("half a reframe falls through to the span fallback", () => {
  // Only the negated clause lowered (the affirmative half came back a fragment). There is no
  // mirrored shape to show, so the words the finding covers are lit instead.
  const TEXT = "It is not bold. It's backwards.";
  const doc = docOf(TEXT, [[clause({ subj: "It", neg: true, comp: "bold" })], null]);
  const built = buildFindingDiagram(doc, finding("reframe", { start: TEXT.indexOf("not"), end: TEXT.indexOf(".") + 1 }), metrics);

  test("still renders, on the span strategy", () => {
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.diagram.highlight.strategy).toBe("span");
    expect(litWords(built.diagram)).toEqual(expect.arrayContaining(["not", "bold"]));
  });
});

describe("the fallback path for a lexical finding", () => {
  const TEXT = "The team will delve into the tapestry.";
  const doc = docOf(TEXT, [
    [{
      subject: { head: word("team", "NN"), modifiers: [{ kind: "word", value: word("The", "DT") }] },
      verb: { head: word("will delve", "VB"), modifiers: [] },
      complement: { kind: "directObject", value: { head: word("tapestry", "NN"), modifiers: [{ kind: "word", value: word("the", "DT") }] } },
    }],
  ]);

  test("lights only the flagged word", () => {
    const built = buildFindingDiagram(doc, finding("lex-delve-family", spanOf(TEXT, "delve")), metrics);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.diagram.highlight.strategy).toBe("span");
    expect(litWords(built.diagram)).toEqual(["will delve"]); // the verb chain carrying "delve"
  });

  test("a second lexical hit lights its own word", () => {
    const built = buildFindingDiagram(doc, finding("lex-ornate-nouns", spanOf(TEXT, "tapestry")), metrics);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(litWords(built.diagram)).toEqual(["tapestry"]);
  });
});

describe("a repeated word is matched by occurrence, not by string equality", () => {
  // "The trap beats the trap." — only the SECOND "trap" is flagged.
  const TEXT = "The trap beats the trap.";
  const doc = docOf(TEXT, [
    [{
      subject: { head: word("trap", "NN"), modifiers: [{ kind: "word", value: word("The", "DT") }] },
      verb: { head: word("beats", "VBZ"), modifiers: [] },
      complement: { kind: "directObject", value: { head: word("trap", "NN"), modifiers: [{ kind: "word", value: word("the", "DT") }] } },
    }],
  ]);

  test("lights the object, not the subject", () => {
    const built = buildFindingDiagram(doc, finding("dead-metaphor/rare-lemma", spanOf(TEXT, "trap", 2)), metrics);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const lit = built.diagram.highlight.elements.filter((e): e is WordElement => e.kind === "word");
    expect(lit).toHaveLength(1);
    expect(lit[0]!.text).toBe("trap");
    expect(lit[0]!.roleKey).toBe("object"); // the direct object, not the subject
  });
});

describe("findings with nothing to diagram", () => {
  test("a formatting finding on text with no clauses returns a reason, not a blank canvas", () => {
    const TEXT = "## Why platforms win — and products don't\n";
    const doc = makeDoc(TEXT); // every unit unparseable; no clauses anywhere
    const built = buildFindingDiagram(doc, finding("formatting/em-dash-density", spanOf(TEXT, "—")), metrics);
    expect(built.ok).toBe(false);
    if (built.ok) return;
    expect(built.reason).toMatch(/did not parse/);
  });

  test("a finding whose span matches no unit says so", () => {
    const doc = docOf("It is bold.", [[clause({ subj: "It", comp: "bold" })]]);
    const built = buildFindingDiagram(doc, finding("lex-delve-family", { start: 500, end: 505 }), metrics);
    expect(built.ok).toBe(false);
    if (built.ok) return;
    expect(built.reason).toMatch(/no sentence/);
  });
});

describe("a tricolon lights the fork it forks on", () => {
  const TEXT = "Products solve workflows, decisions, and interactions.";
  const conj: Word = { text: "and" };
  const doc = docOf(TEXT, [
    [{
      subject: nominal("Products", "NNS"),
      verb: { head: word("solve", "VBP"), modifiers: [] },
      complement: {
        kind: "directObject",
        value: { items: [nominal("workflows"), nominal("decisions"), nominal("interactions")], conjunction: conj },
      },
    }],
  ]);

  test("lights the compound's items and its conjunction", () => {
    const built = buildFindingDiagram(doc, finding("tricolon/density", { start: 0, end: TEXT.length }), metrics);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.diagram.highlight.strategy).toBe("compound");
    expect(litWords(built.diagram)).toEqual(expect.arrayContaining(["workflows", "decisions", "interactions", "and"]));
    expect(built.diagram.highlight.elements.some((e) => e.kind === "line" && e.roleKey === "fork")).toBe(true);
    expect(litWords(built.diagram)).not.toContain("Products");
  });
});

describe("a self-posed question lights both units whole", () => {
  const TEXT = "The result is devastating. It is total.";
  const doc = docOf(TEXT, [
    [clause({ subj: "result", comp: "devastating" })],
    [clause({ subj: "It", comp: "total" })],
  ]);

  test("every word of both sentences is in the set", () => {
    const built = buildFindingDiagram(doc, finding("syntactic/self-posed-question", { start: 0, end: TEXT.length }), metrics);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.diagram.highlight.strategy).toBe("whole-unit");
    expect(litWords(built.diagram)).toEqual(expect.arrayContaining(["result", "devastating", "It", "total"]));
  });
});

// --- end to end, on the shipped no-model path ---
//
// Everything above hands the module hand-built IR, which is the honest way to test the mapping.
// This one runs real text through the rule-based document reader and the real reframe rule, so
// the app's actual click-a-finding path is pinned: an uncontracted two-sentence reframe (the shape
// reframe.ts documents as caught without a model) must come back as a reframe DIAGRAM.
describe("end to end: real text -> reframeRule -> a lit diagram", () => {
  const TEXT = "This is not a rant. This is a diagnosis.";
  const doc: DocAnalysis = {
    text: TEXT,
    units: readDocument(TEXT).map((u): UnitAnalysis => ({ ...u, words: wordSpans(TEXT, u.span) })),
  };
  const findings = reframeRule.detect(doc);

  test("the rule fires and the finding diagrams as the reframe shape", () => {
    expect(findings).toHaveLength(1);
    const built = buildFindingDiagram(doc, findings[0]!, metrics);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.diagram.highlight.strategy).toBe("reframe");
    expect(built.diagram.clausePrefixes).toEqual(["c0", "c1"]);
    expect(litWords(built.diagram)).toEqual(expect.arrayContaining(["not", "rant", "diagnosis"]));
  });
});

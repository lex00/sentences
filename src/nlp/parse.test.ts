import { describe, it, expect } from "vitest";
import { parse } from "./parse.js";
import { lower, lowerSentence } from "../lower.js";
import { layout, type TextMetrics } from "../layout.js";
import { isNode, type Scene, type SceneNode } from "../scene.js";
import type { Nominal, Verbal, Modifier } from "../ir.js";

const ir = (s: string) => lower(parse(s));
const modWords = (n: { modifiers: Modifier[] }) =>
  n.modifiers.filter((m): m is Extract<Modifier, { kind: "word" }> => m.kind === "word").map((m) => m.value.text);

describe("in-browser parser -> IR", () => {
  it("intransitive: determiner + adjective + head, verb + adverb", () => {
    const c = ir("The small dog barked loudly.");
    expect((c.subject as Nominal).head.text).toBe("dog");
    expect(modWords(c.subject as Nominal)).toEqual(["The", "small"]);
    expect((c.verb as Verbal).head.text).toBe("barked");
    expect(modWords(c.verb as Verbal)).toEqual(["loudly"]);
  });

  it("compound subject + transitive object", () => {
    const c = ir("Dogs and cats chase mice.");
    expect("items" in c.subject).toBe(true);
    if ("items" in c.subject) expect(c.subject.items.map((i) => i.head.text)).toEqual(["Dogs", "cats"]);
    expect(c.complement?.kind).toBe("directObject");
  });

  it("copula -> predicate adjective vs predicate nominative", () => {
    expect(ir("The sky is blue.").complement).toMatchObject({ kind: "predicateAdj", value: { text: "blue" } });
    expect(ir("She is a teacher.").complement?.kind).toBe("predicateNoun");
  });

  it("PP attaches to the subject (man in the house), not the verb", () => {
    const c = ir("The man in the house slept.");
    expect((c.subject as Nominal).head.text).toBe("man");
    const pp = (c.subject as Nominal).modifiers.find((m) => m.kind === "prep");
    expect(pp && pp.kind === "prep" && pp.object.head.text).toBe("house");
  });

  it("subordinate clause on the verb", () => {
    const c = ir("The dog slept because dogs barked.");
    const m = (c.verb as Verbal).modifiers.find((x) => x.kind === "clause");
    expect(m && m.kind === "clause" && m.connector.text).toBe("because");
  });

  it("handles irregular verbs + an -ly head noun (compromise POS)", () => {
    // Regression: the hand-rolled tagger mis-tagged "sally" (->adverb) and missed "sold".
    const c = ir("sally sold seashells by the seashore");
    expect((c.subject as Nominal).head.text.toLowerCase()).toBe("sally");
    expect((c.verb as Verbal).head.text).toBe("sold");
    expect(c.complement?.kind).toBe("directObject");
  });

  it("throws when there isn't even a subject+verb (graceful failure for the UI)", () => {
    expect(() => parse("seashells")).toThrow(); // single noun — no predicate
  });
});

describe("questions (subject-auxiliary inversion)", () => {
  it("yes/no question un-inverts: 'Can dogs bark'", () => {
    const c = ir("Can dogs bark");
    expect((c.subject as Nominal).head.text).toBe("dogs");
    expect((c.verb as Verbal).head.text.toLowerCase()).toContain("bark");
  });

  it("copula question: 'Is the sky blue' -> predicate adjective", () => {
    const c = ir("Is the sky blue");
    expect((c.subject as Nominal).head.text).toBe("sky");
    expect(c.complement?.kind).toBe("predicateAdj");
  });

  it("wh-object question: 'What did the dog eat'", () => {
    const c = ir("What did the dog eat");
    expect((c.subject as Nominal).head.text).toBe("dog");
    expect(c.complement?.kind).toBe("directObject");
  });

  it("negation joins the verb chain: 'Why can the dog not run'", () => {
    const c = ir("Why can the dog not run");
    expect((c.verb as Verbal).head.text).toContain("run");
    expect(modWords(c.verb as Verbal)).toContain("not");
  });
});

describe("clause coordination (compound sentences)", () => {
  it("splits independent clauses into a compound sentence", () => {
    const s = lowerSentence(parse("Birds sing and dogs bark"));
    expect(s.clauses).toHaveLength(2);
    expect(s.conjunctions.map((c) => c?.text)).toEqual(["and"]);
    expect((s.clauses[0]!.subject as Nominal).head.text).toBe("Birds");
    expect((s.clauses[1]!.subject as Nominal).head.text).toBe("dogs");
  });

  it("does NOT split NP coordination or VP coordination into clauses", () => {
    expect(lowerSentence(parse("Dogs and cats chase mice")).clauses).toHaveLength(1); // compound subject
    expect(lowerSentence(parse("the dog runs and barks")).clauses).toHaveLength(1); // compound predicate
  });
});

describe("parser -> existing pipeline", () => {
  const metrics: TextMetrics = { measure: (t, sz) => ({ width: t.length * sz * 0.55, ascent: sz * 0.8, descent: sz * 0.2 }) };
  const ids = (s: Scene): string[] => {
    const out: string[] = [];
    (function w(n: SceneNode): void {
      out.push(n.id);
      for (const c of n.children) if (isNode(c)) w(c);
    })(s.root);
    return out;
  };

  it("a typed sentence lays out through the same engine", () => {
    const s = layout(ir("The small dog barked loudly."), metrics);
    expect(ids(s)).toEqual(["c", "c/subj", "c/subj/m0", "c/subj/m1", "c/verb", "c/verb/m0"]);
  });
});

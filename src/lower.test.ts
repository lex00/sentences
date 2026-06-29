import { describe, it, expect } from "vitest";
import { lower, lowerNBest } from "./lower.js";
import { layout, type TextMetrics } from "./layout.js";
import { isNode, type Scene, type SceneNode } from "./scene.js";
import type { Nominal, Verbal, Modifier } from "./ir.js";

// Real-shape Penn-Treebank parses (the format benepar emits) for the fixture sentences.
const PTB = {
  intransitive: "(S (NP (DT The) (JJ small) (NN dog)) (VP (VBD barked) (ADVP (RB loudly))))",
  compound: "(S (NP (NP (NNS Dogs)) (CC and) (NP (NNS cats))) (VP (VBP chase) (NP (NNS mice))))",
  subclause: "(S (NP (DT The) (NN dog)) (VP (VBD slept) (SBAR (IN because) (S (NP (NNS dogs)) (VP (VBD barked))))))",
  predAdj: "(ROOT (S (NP (DT The) (NN sky)) (VP (VBZ is) (ADJP (JJ blue)))))",
  pp: "(S (NP (NP (DT the) (NN man)) (PP (IN in) (NP (DT the) (NN house)))) (VP (VBD slept)))",
};

const modWords = (n: { modifiers: Modifier[] }): string[] =>
  n.modifiers.filter((m): m is Extract<Modifier, { kind: "word" }> => m.kind === "word").map((m) => m.value.text);

describe("lower: constituency parse -> IR", () => {
  it("intransitive: subject head + premodifiers, verb + adverb", () => {
    const c = lower(PTB.intransitive);
    expect((c.subject as Nominal).head.text).toBe("dog");
    expect(modWords(c.subject as Nominal)).toEqual(["The", "small"]);
    expect(modWords(c.verb as Verbal)).toEqual(["loudly"]);
    expect(c.complement).toBeNull();
  });

  it("compound subject -> Compound with conjunction; transitive object", () => {
    const c = lower(PTB.compound);
    expect("items" in c.subject).toBe(true);
    if ("items" in c.subject) {
      expect(c.subject.items.map((i) => i.head.text)).toEqual(["Dogs", "cats"]);
      expect(c.subject.conjunction.text).toBe("and");
    }
    expect(c.complement?.kind).toBe("directObject");
    if (c.complement?.kind === "directObject") expect((c.complement.value as Nominal).head.text).toBe("mice");
  });

  it("subordinate clause modifier on the verb", () => {
    const c = lower(PTB.subclause);
    const m = (c.verb as Verbal).modifiers[0];
    expect(m?.kind).toBe("clause");
    if (m?.kind === "clause") {
      expect(m.connector.text).toBe("because");
      expect((m.value.subject as Nominal).head.text).toBe("dogs");
      expect((m.value.verb as Verbal).head.text).toBe("barked");
    }
  });

  it("copula + ADJP -> predicate adjective (ROOT wrapper unwrapped)", () => {
    const c = lower(PTB.predAdj);
    expect(c.complement?.kind).toBe("predicateAdj");
    if (c.complement?.kind === "predicateAdj" && "text" in c.complement.value) expect(c.complement.value.text).toBe("blue");
  });

  it("nested NP + PP -> prep modifier on the base nominal", () => {
    const c = lower(PTB.pp);
    expect((c.subject as Nominal).head.text).toBe("man");
    const pp = (c.subject as Nominal).modifiers.find((m) => m.kind === "prep");
    expect(pp?.kind).toBe("prep");
    if (pp?.kind === "prep") {
      expect(pp.prep.text).toBe("in");
      expect(pp.object.head.text).toBe("house");
    }
  });
});

describe("lower: end-to-end through the existing pipeline", () => {
  const metrics: TextMetrics = { measure: (t, sz) => ({ width: t.length * sz * 0.55, ascent: sz * 0.8, descent: sz * 0.2 }) };
  const ids = (s: Scene): string[] => {
    const out: string[] = [];
    (function w(n: SceneNode): void {
      out.push(n.id);
      for (const c of n.children) if (isNode(c)) w(c);
    })(s.root);
    return out;
  };

  it("parser output lays out with the SAME ids as the hand-built fixture", () => {
    const s = layout(lower(PTB.intransitive), metrics);
    expect(ids(s)).toEqual(["c", "c/subj", "c/subj/m0", "c/subj/m1", "c/verb", "c/verb/m0"]);
  });

  it("compound parse lays out a fork with branch ids + object", () => {
    const s = layout(lower(PTB.compound), metrics);
    expect(ids(s)).toEqual(expect.arrayContaining(["c/subj", "c/subj/b0", "c/subj/b1", "c/obj"]));
  });
});

describe("lowerNBest", () => {
  it("lowers good parses and drops unsupported ones", () => {
    const out = lowerNBest([PTB.intransitive, "(S (NP (NN fragment)))", PTB.predAdj]);
    expect(out).toHaveLength(2); // the NP-only fragment (no VP) is dropped
  });
});

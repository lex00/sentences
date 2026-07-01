import { describe, it, expect } from "vitest";
import { lower, lowerNBest } from "./lower.js";
import { layout, type TextMetrics } from "./layout.js";
import { isNode, type Scene, type SceneNode } from "./scene.js";
import type { Nominal, Verbal, Modifier, Clause } from "./ir.js";

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

  it("PP with a clause object doesn't repeat the preposition ('after leaving Portugal')", () => {
    const c = lower("(S (NP (NNP Sarah)) (VP (VBD went) (PP (IN after) (S (VP (VBG leaving) (NP (NNP Portugal)))))))");
    const pp = (c.verb as Verbal).modifiers.find((m) => m.kind === "prep");
    expect(pp?.kind).toBe("prep");
    if (pp?.kind === "prep") {
      expect(pp.prep.text).toBe("after");
      expect(pp.object.head.text).toBe("leaving Portugal"); // not "after leaving Portugal"
    }
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

describe("lower: questions and relative clauses (benepar structures)", () => {
  it("yes/no question (SQ) un-inverts to subject + predicate adjective", () => {
    const c = lower("(SQ (VBZ Is) (NP (DT the) (NN sky)) (ADJP (JJ blue)))");
    expect((c.subject as Nominal).head.text).toBe("sky");
    expect((c.verb as Verbal).head.text).toBe("Is");
    expect(c.complement?.kind).toBe("predicateAdj");
  });

  it("wh-question (SBARQ) with wh-subject: 'Who chased the cat'", () => {
    const c = lower("(SBARQ (WHNP (WP Who)) (SQ (VP (VBD chased) (NP (DT the) (NN cat)))))");
    expect((c.subject as Nominal).head.text).toBe("Who");
    expect((c.verb as Verbal).head.text).toBe("chased");
    expect(c.complement?.kind).toBe("directObject");
  });

  it("imperative: a subjectless top clause gets an implied '(you)' subject", () => {
    const c = lower("(S (VP (VB Water) (NP (DT the) (NNS begonias))) (. .))");
    expect((c.subject as Nominal).head.text).toBe("(you)");
    expect((c.verb as Verbal).head.text).toBe("Water");
    expect(c.complement?.kind).toBe("directObject");
  });

  it("a gerund subject lowers as a gerund, not mistaken for an imperative '(you)'", () => {
    const c = lower("(S (S (VP (VBG Running) (NP (NNS marathons)))) (VP (VBZ is) (NP (NN fun))))");
    expect((c.subject as { kind?: string }).kind).toBe("gerund");
    expect((c.subject as { verb: { text: string } }).verb.text).toBe("Running");
    expect((c.subject as { object: Nominal }).object.head.text).toBe("marathons");
  });

  it("an infinitive subject lowers as an infinitive on a stand", () => {
    const c = lower("(S (S (VP (TO To) (VP (VB master) (NP (DT a) (JJ new) (NN skill))))) (VP (VBZ takes) (NP (NN patience))))");
    expect((c.subject as { kind?: string }).kind).toBe("infinitive");
    expect((c.subject as { verb: { text: string } }).verb.text).toBe("master");
  });

  it("a noun clause subject lowers as a nested clause (Whoever made this pottery)", () => {
    const c = lower("(S (SBAR (WHNP (WP Whoever)) (S (VP (VBD made) (NP (DT this) (NN pottery))))) (VP (VBD did) (NP (DT a) (JJ good) (NN job))))");
    const subj = c.subject as Clause;
    expect((subj.subject as Nominal).head.text).toBe("Whoever");
    expect((subj.verb as Verbal).head.text).toBe("made");
  });

  it("SBARQ without an SQ (declarative-order question) lowers its clause instead of crashing", () => {
    const c = lower("(SBARQ (INTJ (UH Wow)) (. !) (NP (PRP You)) (VP (MD will) (VP (VB run) (NP (DT a) (NN marathon)))) (. ?))");
    expect((c.subject as Nominal).head.text).toBe("You");
    expect((c.verb as Verbal).head.text).toBe("will run");
    expect(c.detached?.map((d) => d.text)).toEqual(["Wow"]);
  });

  it("interjection is captured as a detached element, not dropped", () => {
    const c = lower("(S (INTJ (UH Man)) (, ,) (NP (DT that)) (VP (VBD hurt)) (. !))");
    expect((c.subject as Nominal).head.text).toBe("that");
    expect(c.detached?.map((d) => d.text)).toEqual(["Man"]);
  });

  it("possessive noun is a determiner-like modifier, not dropped", () => {
    const c = lower("(S (NP (NP (NNP Alicia) (POS 's)) (NN hobby)) (VP (VBZ sleeps)))");
    const subj = c.subject as Nominal;
    expect(subj.head.text).toBe("hobby");
    const poss = subj.modifiers.find((m): m is Extract<Modifier, { kind: "word" }> => m.kind === "word");
    expect(poss?.value.text).toBe("Alicia's");
  });

  it("ditransitive verb: first of two object NPs is the indirect object", () => {
    const c = lower("(S (NP (NNP Mrs.) (NNP Doubtfire)) (VP (VBD gave) (NP (DT the) (NNS children)) (NP (NN homework))))");
    expect((c.verb as Verbal).indirectObject?.head.text).toBe("children");
    expect(c.complement?.kind).toBe("directObject");
    if (c.complement?.kind === "directObject") expect((c.complement.value as Nominal).head.text).toBe("homework");
  });

  it("objective complement (noun) via a following small clause: 'named our daughter Alice'", () => {
    const c = lower("(S (NP (PRP We)) (VP (VBD named) (NP (PRP$ our) (NN daughter)) (S (NP (NNP Alice)))))");
    expect(c.complement?.kind).toBe("objectComplement");
    if (c.complement?.kind === "objectComplement") {
      expect((c.complement.object as Nominal).head.text).toBe("daughter");
      expect(c.complement.ocIsAdj).toBe(false);
      expect((c.complement.oc as Nominal).head.text).toBe("Alice");
    }
  });

  it("objective complement (adjective) via a nested small clause: 'makes me happy'", () => {
    const c = lower("(S (NP (DT This) (NN music)) (VP (VBZ makes) (S (NP (PRP me)) (ADJP (JJ happy)))))");
    expect(c.complement?.kind).toBe("objectComplement");
    if (c.complement?.kind === "objectComplement") {
      expect((c.complement.object as Nominal).head.text).toBe("me");
      expect(c.complement.ocIsAdj).toBe(true);
      expect((c.complement.oc as { text: string }).text).toBe("happy");
    }
  });

  it("correlative subject: 'both Max and I' folds the marker into the conjunction, not onto Max", () => {
    const c = lower("(S (NP (DT Both) (NNP Max) (CC and) (PRP I)) (VP (VBD hit) (NP (NNS homers))))");
    const subj = c.subject as { items: Nominal[]; conjunction: { text: string } };
    expect(subj.items.map((i) => i.head.text)).toEqual(["Max", "I"]);
    expect(subj.conjunction.text).toBe("both...and");
    expect(subj.items[0]!.modifiers).toHaveLength(0); // "both" is NOT a modifier on Max
  });

  it("correlative bare-verb coordination: 'either complains or criticizes'", () => {
    const c = lower("(S (NP (PRP She)) (VP (CC either) (VBZ complains) (CC or) (VBZ criticizes)))");
    const v = c.verb as { items: Verbal[]; conjunction: { text: string } };
    expect(v.items.map((i) => i.head.text)).toEqual(["complains", "criticizes"]);
    expect(v.conjunction.text).toBe("either...or");
  });

  it("set-off participial phrase modifies the subject, not mistaken for the subject", () => {
    const c = lower("(S (NP (DT The) (NN dog)) (, ,) (S (VP (VBG barking) (ADVP (RB furiously)))) (, ,) (VP (VBD chased) (NP (DT the) (JJ frightened) (NN boy))))");
    const subj = c.subject as Nominal;
    expect(subj.head.text).toBe("dog");
    const part = subj.modifiers.find((m): m is Extract<Modifier, { kind: "participle" }> => m.kind === "participle");
    expect(part?.verb.text).toBe("barking");
  });

  it("fronted participial phrase does not steal the subject slot from a following NP", () => {
    const c = lower("(S (S (VP (VBG Growling))) (, ,) (NP (DT the) (NN monster)) (VP (VBD charged) (NP (DT the) (VBN wounded) (NN hero))))");
    expect((c.subject as Nominal).head.text).toBe("monster"); // NOT the gerund "Growling"
    expect((c.subject as Nominal).modifiers.some((m) => m.kind === "participle")).toBe(true);
  });

  it("relative clause: the wh-word is the gapped subject, no separate connector", () => {
    const c = lower("(S (NP (NP (DT The) (NN dog)) (SBAR (WHNP (WDT that)) (S (VP (VBD barked))))) (VP (VBD ran) (ADVP (RB away))))");
    expect((c.subject as Nominal).head.text).toBe("dog");
    const rel = (c.subject as Nominal).modifiers.find((m) => m.kind === "clause");
    expect(rel?.kind).toBe("clause");
    if (rel?.kind === "clause") {
      expect(rel.connector.text).toBe(""); // relativizer is the subject, not a connector word
      expect((rel.value.subject as Nominal).head.text).toBe("that");
      expect((rel.value.verb as Verbal).head.text).toBe("barked");
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

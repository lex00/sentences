import { describe, it, expect } from "vitest";
import { lower } from "../lower.js";
import { parse } from "../nlp/parse.js";
import { BANK } from "../game/bank.js";
import { isCopular, isNegated, complementHead, complementHeads, subjectHead, subjectHeads, subjectIsPronominal } from "./ir-query.js";

// The rule-based parser (src/nlp/parse.ts) is the everyday path: real sentences, tagged and
// chunked the way the game/free-write mode sees them.
const ir = (s: string) => lower(parse(s));

describe("ir-query: acceptance", () => {
  it('"This is not bold." -> copular, negated, complement "bold", demonstrative subject', () => {
    const c = ir("This is not bold.");
    expect(isCopular(c)).toBe(true);
    expect(isNegated(c)).toBe(true);
    expect(complementHead(c)?.text).toBe("bold");
    expect(subjectHead(c)?.text).toBe("This");
    expect(subjectIsPronominal(c)).toBe(true);
  });

  it('"It\'s backwards wearing bold clothes." -> copular, not negated, complement carries a participle', () => {
    // The rule-based parser (parse.ts) can't handle this construction (a predicate adjective
    // trailed by a participial adjunct) — it throws before lowering ever runs. Fixture built by
    // hand instead, in real-shape PTB (the same convention lower.test.ts uses for cases the
    // rule-based chunker doesn't reach), representing "It's" as its expanded "It is".
    const tree = "(S (NP (PRP It)) (VP (VBZ is) (NP (NP (JJ backwards)) (VP (VBG wearing) (NP (JJ bold) (NNS clothes))))))";
    const c = lower(tree);
    expect(isCopular(c)).toBe(true);
    expect(isNegated(c)).toBe(false);
    expect(complementHead(c)?.text).toBe("backwards");
    expect(c.complement?.kind).toBe("predicateNoun");
    if (c.complement?.kind === "predicateNoun" && "modifiers" in c.complement.value) {
      expect(c.complement.value.modifiers.some((m) => m.kind === "participle")).toBe(true);
    }
  });
});

describe("isCopular", () => {
  it("recognizes a contracted be-form (\"isn't\") fused into the verb head", () => {
    const c = ir("This isn't bold.");
    expect((c.verb as { head: { text: string } }).head.text).toBe("isn't"); // documents the fused shape isCopular has to see past
    expect(isCopular(c)).toBe(true);
  });

  it("recognizes a verb-phrase head ending in a be-form (\"has been\")", () => {
    const c = ir("This has not been bold.");
    expect((c.verb as { head: { text: string } }).head.text).toBe("has been");
    expect(isCopular(c)).toBe(true);
  });

  it("does not treat an aux chain ending in a participle as copular", () => {
    const c = ir("The ball was thrown by the boy.");
    expect(isCopular(c)).toBe(false);
  });

  it("excludes linking verbs outside the strict be-form set (\"seems\")", () => {
    const c = ir("It seems bold.");
    expect(isCopular(c)).toBe(false);
  });

  it("is false for a transitive verb even with an object present", () => {
    const c = ir("He doesn't run.");
    expect(isCopular(c)).toBe(false);
  });

  it("bails to false for a compound predicate rather than guessing a conjunct", () => {
    const bank = BANK.find((b) => b.sentence === "The dog has black fur and can jump high.")!;
    const c = lower(bank.ptb);
    expect("items" in c.verb).toBe(true);
    expect(isCopular(c)).toBe(false);
  });
});

describe("isNegated", () => {
  it("catches a spelled-out \"not\" modifier on the verb", () => {
    expect(isNegated(ir("This is not bold."))).toBe(true);
  });

  it("catches a contraction fused into the verb head (\"doesn't\")", () => {
    const c = ir("He doesn't run.");
    expect((c.verb as { head: { text: string } }).head.text).toBe("doesn't run");
    expect(isNegated(c)).toBe(true);
  });

  it("is false with no negation anywhere", () => {
    expect(isNegated(ir("It seems bold."))).toBe(false);
  });

  it("checks every conjunct of a compound predicate (true if any conjunct is negated)", () => {
    const tree =
      "(S (NP (PRP She)) (VP (VP (VBZ likes) (NP (NNS cats))) (CC and) (VP (VBZ does) (RB not) (VP (VB like) (NP (NNS dogs))))))";
    const c = lower(tree);
    expect("items" in c.verb).toBe(true);
    expect(isNegated(c)).toBe(true);
  });

  it("a compound predicate with no negated conjunct is false", () => {
    const bank = BANK.find((b) => b.sentence === "The dog has black fur and can jump high.")!;
    const c = lower(bank.ptb);
    expect(isNegated(c)).toBe(false);
  });
});

describe("complementHead / complementHeads", () => {
  it("predicateAdj: the bare adjective", () => {
    const c = ir("This is not bold.");
    expect(complementHead(c)?.text).toBe("bold");
  });

  it("predicateNoun: the noun head, modifiers ignored", () => {
    const bank = BANK.find((b) => b.sentence === "Running is my favorite sport.")!;
    const c = lower(bank.ptb);
    expect(complementHead(c)?.text).toBe("sport");
  });

  it("directObject: the last object in a ditransitive (\"gave the children homework\")", () => {
    const bank = BANK.find((b) => b.sentence === "Mrs. Doubtfire gave the children homework.")!;
    const c = lower(bank.ptb);
    expect(complementHead(c)?.text).toBe("homework");
  });

  it("objectComplement: the complement noun, not the object (\"elected my uncle mayor\")", () => {
    const bank = BANK.find((b) => b.sentence === "They elected my uncle mayor.")!;
    const c = lower(bank.ptb);
    expect(complementHead(c)?.text).toBe("mayor");
  });

  it("objectComplement with an adjective oc (\"makes me happy\")", () => {
    const bank = BANK.find((b) => b.sentence === "This music makes me happy.")!;
    const c = lower(bank.ptb);
    expect(complementHead(c)?.text).toBe("happy");
  });

  it("null when the clause has no complement (compound predicate)", () => {
    const bank = BANK.find((b) => b.sentence === "The dog has black fur and can jump high.")!;
    const c = lower(bank.ptb);
    expect(complementHead(c)).toBeNull();
  });

  it("complementHeads returns every part of a coordinated predicate adjective", () => {
    const tree = "(S (NP (PRP It)) (VP (VBZ is) (ADJP (JJ tiny) (CC and) (JJ loud))))";
    const c = lower(tree);
    expect(complementHeads(c).map((w) => w.text)).toEqual(["tiny", "loud"]);
  });
});

describe("subjectHead / subjectHeads / subjectIsPronominal", () => {
  it("plain nominal subject", () => {
    const c = ir("He doesn't run.");
    expect(subjectHead(c)?.text).toBe("He");
    expect(subjectIsPronominal(c)).toBe(true);
  });

  it("compound subject: first item is the head, subjectHeads returns all", () => {
    const bank = BANK.find((b) => b.sentence === "Both Max and I hit homers.")!;
    const c = lower(bank.ptb);
    expect(subjectHead(c)?.text).toBe("Max");
    expect(subjectHeads(c).map((w) => w.text)).toEqual(["Max", "I"]);
    expect(subjectIsPronominal(c)).toBe(false); // head is "Max", not "I"
  });

  it("a bare demonstrative subject with no POS tag on the head falls back to the word list", () => {
    const c = ir("This is not bold.");
    const head = subjectHead(c);
    expect(head?.pos).toBeUndefined(); // documents the lowering quirk this fallback exists for
    expect(subjectIsPronominal(c)).toBe(true);
  });

  it("a determiner-modified noun subject is not pronominal, even though 'This' is present", () => {
    const bank = BANK.find((b) => b.sentence === "This music makes me happy.")!;
    const c = lower(bank.ptb);
    expect(subjectHead(c)?.text).toBe("music");
    expect(subjectIsPronominal(c)).toBe(false);
  });

  it("a gerund subject uses its own verb as the head (\"Running marathons is fun\")", () => {
    const c = lower("(S (S (VP (VBG Running) (NP (NNS marathons)))) (VP (VBZ is) (NP (NN fun))))");
    expect(subjectHead(c)?.text).toBe("Running");
    expect(subjectIsPronominal(c)).toBe(false);
  });

  it("an infinitive subject uses its own verb as the head", () => {
    const c = lower(
      "(S (S (VP (TO To) (VP (VB master) (NP (DT a) (JJ new) (NN skill))))) (VP (VBZ takes) (NP (NN patience))))",
    );
    expect(subjectHead(c)?.text).toBe("master");
  });

  it("a noun-clause subject has no single head word (returns null)", () => {
    const c = lower(
      "(S (SBAR (WHNP (WP Whoever)) (S (VP (VBD made) (NP (DT this) (NN pottery))))) (VP (VBD did) (NP (DT a) (JJ good) (NN job))))",
    );
    expect(subjectHead(c)).toBeNull();
    expect(subjectIsPronominal(c)).toBe(false);
  });
});

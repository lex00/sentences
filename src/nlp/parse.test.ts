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

// Engine bug #31: compromise hands the second half of a contraction back as a ZERO-WIDTH term, and
// the tagger used to drop it — so "It's not bold" tagged PRP RB JJ, had no verb at all, and
// readDocument called it a fragment. tagger.ts now splits the clitic off its host and expands it.
describe("contracted verbs (#31)", () => {
  it("lowers a contracted copula to subject + verb + negation + predicate adjective", () => {
    const c = ir("It's not bold.");
    expect((c.subject as Nominal).head.text).toBe("It");
    expect((c.verb as Verbal).head.text).toBe("is"); // expanded: lower.ts's COPULA list holds "is", never "'s"
    expect(modWords(c.verb as Verbal)).toEqual(["not"]);
    expect(c.complement).toMatchObject({ kind: "predicateAdj", value: { text: "bold" } });
  });

  it("keeps the copula reading for a predicate noun: “He's a doctor.”", () => {
    const c = ir("He's a doctor.");
    expect((c.verb as Verbal).head.text).toBe("is");
    expect(c.complement?.kind).toBe("predicateNoun"); // not a direct object
  });

  it.each([
    ["They're happy.", "are"],
    ["I'm tired.", "am"],
    ["That's not bold.", "is"],
  ])("expands the copula clitic in %s", (text, verb) => {
    expect(((ir(text) as { verb: Verbal }).verb).head.text).toBe(verb);
  });

  it.each([
    ["It's been raining.", "has been raining"], // "'s" before a participle is HAVE, not BE
    ["They'll come.", "will come"],
    ["She'd left already.", "had left"], // vs. the modal reading below
    ["She'd like tea.", "would like"],
    ["I've seen it.", "have seen"],
  ])("expands the auxiliary/modal clitic in %s", (text, verb) => {
    expect(((ir(text) as { verb: Verbal }).verb).head.text).toBe(verb);
  });

  it("leaves an n't-fused verb fused — the negation is still in the surface word", () => {
    // Not split, on purpose: the whole downstream stack reads the negation off the fused head
    // (lint/ir-query's stripContractedNegation). These already parsed before #31 and still do.
    expect((ir("It isn't bold.").verb as Verbal).head.text).toBe("isn't");
    expect((ir("He doesn't run.").verb as Verbal).head.text).toBe("doesn't run");
  });

  it("leaves a possessive 's alone (it is not a dropped verb)", () => {
    const c = ir("The city's heritage is rich.");
    expect((c.subject as Nominal).head.text).toBe("heritage");
    expect(modWords(c.subject as Nominal)).toEqual(["The", "city's"]);
  });
});

describe("infinitives and 'to' disambiguation", () => {
  it("infinitive is its own construction, not joined to the verb: 'I need to take a big old walk'", () => {
    const c = ir("i need to take a big old walk");
    expect((c.verb as Verbal).head.text).toBe("need"); // "need" is the verb...
    expect(c.complement?.kind).toBe("directObject");
    if (c.complement?.kind === "directObject" && "kind" in c.complement.value) {
      expect(c.complement.value.verb.text).toBe("take"); // ...and "to take a walk" is an infinitive object
      expect(c.complement.value.object?.head.text).toBe("walk");
    }
  });

  it("a verb-lexicon word is a NOUN head when it heads a determiner-led NP: 'a big old walk is nice'", () => {
    const c = ir("a big old walk is nice");
    expect((c.subject as Nominal).head.text).toBe("walk");
    expect(c.complement?.kind).toBe("predicateAdj");
  });

  it("'to' + noun stays a preposition: 'I went to the store'", () => {
    const c = ir("I went to the store");
    const pp = (c.verb as Verbal).modifiers.find((m) => m.kind === "prep");
    expect(pp && pp.kind === "prep" && pp.object.head.text).toBe("store");
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

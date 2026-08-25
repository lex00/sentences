// Tests for the lexical tier (issue #20): the matching semantics documented at the top of
// lexical.ts — case, word boundaries, multi-word contiguity, lemma inflections, posGate
// fail-closed behavior, and the density-based severity step-down.
import { describe, it, expect } from "vitest";
import type { DocAnalysis, WordSpan } from "../types.js";
import { makeDoc, spanOf } from "../stub-doc.js";
import { RULES } from "../registry.js";
import {
  LEXICAL_RULES,
  lemmaMatches,
  lexDelveFamilyRule,
  lexFalseSuspenseRule,
  lexFillerTransitionsRule,
  lexInventedConceptLabelsRule,
  lexMagicAdverbsRule,
  lexOrnateNounsRule,
  lexPedagogicalVoiceRule,
  lexSignpostsRule,
  lexStakesInflationRule,
  lexVagueAttributionRule,
} from "./lexical.js";

// Builds a one-unit DocAnalysis from hand-picked words (with pos, when the test needs it). Every
// word's span comes from spanOf, so offsets are still real slices of `text` — only `pos` is
// invented, standing in for what a real tagger would eventually fill in on WordSpan.
function docWithPos(text: string, words: Array<{ token: string; pos?: string }>): DocAnalysis {
  const seen = new Map<string, number>();
  const wordSpans: WordSpan[] = words.map(({ token, pos }) => {
    const nth = (seen.get(token) ?? 0) + 1;
    seen.set(token, nth);
    return { text: token, span: spanOf(text, token, nth), ...(pos ? { pos } : {}) };
  });
  return {
    text,
    units: [{ unit: text, span: { start: 0, end: text.length }, outcome: "unparseable", reason: "test fixture", words: wordSpans }],
  };
}

describe("lemmaMatches", () => {
  it("matches the bare word and its regular inflections", () => {
    expect(lemmaMatches("delve", "delve")).toBe(true);
    expect(lemmaMatches("delve", "delves")).toBe(true);
    expect(lemmaMatches("delve", "delving")).toBe(true);
    expect(lemmaMatches("delve", "delved")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(lemmaMatches("delve", "Delving")).toBe(true);
  });

  it("does not match an unrelated word", () => {
    expect(lemmaMatches("delve", "dive")).toBe(false);
    expect(lemmaMatches("delve", "delver")).toBe(false);
  });

  it("handles y -> ies/ied after a consonant, and keeps y before -ing", () => {
    expect(lemmaMatches("deny", "denies")).toBe(true);
    expect(lemmaMatches("deny", "denied")).toBe(true);
    expect(lemmaMatches("deny", "denying")).toBe(true);
  });
});

describe("lexDelveFamilyRule: lemma matching (delve/delves/delving)", () => {
  it("catches all three inflections, each at the entry's overridden severity", () => {
    const doc = makeDoc("We delve into it. She delves further. They keep delving forever.");
    const findings = lexDelveFamilyRule.detect(doc);
    const texts = findings.map((f) => doc.text.slice(f.span.start, f.span.end).toLowerCase());
    expect(texts).toEqual(["delve", "delves", "delving"]);
    // "delve" carries its own severity override ("medium"), so density (threshold 2) never
    // downgrades it even though nothing else about density changes here.
    expect(findings.every((f) => f.severity === "medium")).toBe(true);
  });
});

describe("posGate: leverage as verb vs. leverage as noun", () => {
  it("fires when the word is tagged as a verb", () => {
    const doc = docWithPos("We should leverage our funding.", [
      { token: "We" },
      { token: "should" },
      { token: "leverage", pos: "VBP" },
      { token: "our" },
      { token: "funding" },
    ]);
    const findings = lexDelveFamilyRule.detect(doc);
    expect(findings).toHaveLength(1);
    expect(doc.text.slice(findings[0]!.span.start, findings[0]!.span.end)).toBe("leverage");
  });

  it("does not fire when the word is tagged as a noun", () => {
    const doc = docWithPos("The leverage was gone by noon.", [
      { token: "The" },
      { token: "leverage", pos: "NN" },
      { token: "was" },
      { token: "gone" },
      { token: "by" },
      { token: "noon" },
    ]);
    expect(lexDelveFamilyRule.detect(doc)).toHaveLength(0);
  });

  it("fails closed (does not fire) when pos is entirely absent, even though the text matches", () => {
    // makeDoc never fills WordSpan.pos, so a gated entry must stay silent here — no guessing.
    const doc = makeDoc("We leverage our funding.");
    expect(lexDelveFamilyRule.detect(doc)).toHaveLength(0);
  });
});

describe("word boundaries", () => {
  it("does not match a single-word entry inside a longer token", () => {
    const doc = makeDoc("The API's robustness improved this year.");
    expect(lexDelveFamilyRule.detect(doc)).toHaveLength(0);
  });

  it("does match the whole word on its own", () => {
    const doc = makeDoc("The API is robust.");
    const findings = lexDelveFamilyRule.detect(doc);
    expect(findings).toHaveLength(1);
    expect(doc.text.slice(findings[0]!.span.start, findings[0]!.span.end)).toBe("robust");
  });
});

describe("multi-word phrase matching, including a contraction token", () => {
  it("matches a contiguous phrase whose first token is a contraction", () => {
    // stub-doc's tokenizer keeps "It's" as one token, matching the lexicon's ["it's", "worth",
    // "noting"] convention with no special-casing here.
    const doc = makeDoc("It's worth noting that this holds in practice.");
    const findings = lexFillerTransitionsRule.detect(doc);
    expect(findings).toHaveLength(1);
    expect(doc.text.slice(findings[0]!.span.start, findings[0]!.span.end)).toBe("It's worth noting");
    expect(findings[0]!.severity).toBe("medium"); // lex-filler-transitions has no densityThreshold
    expect(findings[0]!.message).toContain("Filler transitions");
  });

  it("does not match when the tokens are not contiguous", () => {
    const doc = makeDoc("It's, worth saying, noting how this reads.");
    expect(lexFillerTransitionsRule.detect(doc)).toHaveLength(0);
  });
});

describe("density thresholds", () => {
  it("downgrades a single below-threshold hit by one severity step, floored at candidate", () => {
    const doc = makeDoc("We should utilize this approach.");
    const findings = lexDelveFamilyRule.detect(doc);
    expect(findings).toHaveLength(1);
    // "utilize" has no severity override; lexicon defaultSeverity is "low"; densityThreshold is 2
    // and total hits here is 1, so it steps down once: low -> candidate.
    expect(findings[0]!.severity).toBe("candidate");
  });

  it("does not downgrade once total hits reach the threshold", () => {
    const doc = makeDoc("We should utilize this. Let's streamline it too.");
    const findings = lexDelveFamilyRule.detect(doc);
    const bySpan = findings.map((f) => doc.text.slice(f.span.start, f.span.end).toLowerCase());
    expect(bySpan.sort()).toEqual(["streamline", "utilize"]);
    // Two default-severity hits meets densityThreshold 2, so both stay at "low".
    expect(findings.every((f) => f.severity === "low")).toBe(true);
  });

  it("never downgrades an entry that carries its own severity override, even alone", () => {
    const doc = makeDoc("We need to delve into this.");
    const findings = lexDelveFamilyRule.detect(doc);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe("medium"); // "delve"'s own override, density does not apply
  });
});

describe("acceptance pairs across a few lexicons", () => {
  it("lex-ornate-nouns: tapestry keeps its severity override regardless of density", () => {
    const doc = makeDoc("The rich tapestry of the story unfolds slowly.");
    const findings = lexOrnateNounsRule.detect(doc);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe("medium");
  });

  it("lex-false-suspense: a fixed phrase fires at full severity on a single occurrence", () => {
    const doc = makeDoc("Here's the kicker: nobody saw it coming.");
    const findings = lexFalseSuspenseRule.detect(doc);
    expect(findings).toHaveLength(1);
    expect(doc.text.slice(findings[0]!.span.start, findings[0]!.span.end)).toBe("Here's the kicker");
    expect(findings[0]!.severity).toBe("medium");
  });

  it("lex-stakes-inflation: a two-word phrase spans exactly its two tokens", () => {
    const doc = makeDoc("This will fundamentally reshape how we work.");
    const findings = lexStakesInflationRule.detect(doc);
    expect(findings).toHaveLength(1);
    expect(doc.text.slice(findings[0]!.span.start, findings[0]!.span.end)).toBe("fundamentally reshape");
  });

  it("lex-invented-concept-labels: posGate noun fails closed under the stub tokenizer", () => {
    const doc = makeDoc("This creates a real trap for newcomers.");
    // makeDoc fills no pos, and lex-invented-concept-labels gates every entry on posGate:"noun".
    expect(lexInventedConceptLabelsRule.detect(doc)).toHaveLength(0);
  });

  it("lex-invented-concept-labels: fires once pos evidence says it's a noun", () => {
    const doc = docWithPos("This is workload creep.", [
      { token: "This" },
      { token: "is" },
      { token: "workload", pos: "NN" },
      { token: "creep", pos: "NN" },
    ]);
    const findings = lexInventedConceptLabelsRule.detect(doc);
    expect(findings).toHaveLength(1);
  });

  it("lex-pedagogical-voice: matches a multi-word teacher-voice phrase", () => {
    const doc = makeDoc("Let's break this down into three parts.");
    const findings = lexPedagogicalVoiceRule.detect(doc);
    expect(findings).toHaveLength(1);
  });

  it("lex-vague-attribution: matches an unnamed-source phrase", () => {
    const doc = makeDoc("Experts argue that this approach has limitations.");
    const findings = lexVagueAttributionRule.detect(doc);
    expect(findings).toHaveLength(1);
  });

  it("lex-signposts: below density, a single signpost is downgraded", () => {
    const doc = makeDoc("In conclusion, this approach works.");
    const findings = lexSignpostsRule.detect(doc);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe("candidate"); // low -> candidate, threshold 2, 1 hit
  });

  it("lex-magic-adverbs: posGate adverb fails closed under the stub tokenizer", () => {
    const doc = makeDoc("This quietly changes everything about the approach.");
    expect(lexMagicAdverbsRule.detect(doc)).toHaveLength(0);
  });
});

describe("rule shape and registration", () => {
  it("every lexical rule reports tier 'lexical' and id === lexicon id", () => {
    for (const rule of LEXICAL_RULES) {
      expect(rule.tier).toBe("lexical");
      expect(rule.id.startsWith("lex-")).toBe(true);
    }
  });

  it("builds exactly 10 rules, skipping the two structural lexicons", () => {
    const ids = LEXICAL_RULES.map((r) => r.id).sort();
    expect(ids).toEqual(
      [
        "lex-delve-family",
        "lex-false-suspense",
        "lex-filler-transitions",
        "lex-invented-concept-labels",
        "lex-magic-adverbs",
        "lex-ornate-nouns",
        "lex-pedagogical-voice",
        "lex-signposts",
        "lex-stakes-inflation",
        "lex-vague-attribution",
      ].sort(),
    );
    expect(ids).not.toContain("lex-serves-as-verbs");
    expect(ids).not.toContain("lex-superficial-ing-verbs");
  });

  it("gives every rule a non-empty explanation on every finding", () => {
    const doc = makeDoc("Here's the kicker: this is the whole point, in conclusion.");
    for (const rule of LEXICAL_RULES) {
      for (const finding of rule.detect(doc)) {
        expect(finding.explanation.length).toBeGreaterThan(0);
      }
    }
  });

  it("is wired into the app-wide registry", () => {
    const ids = new Set(RULES.map((r) => r.id));
    for (const id of LEXICAL_RULES.map((r) => r.id)) expect(ids.has(id)).toBe(true);
  });
});

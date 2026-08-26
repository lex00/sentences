// Behavior for rules/quantity-hook.ts. The fixture battery (fixtures/quantity-hook.ts) covers the
// fire/stay-silent shape on single specimens; this file covers what it cannot: the coverage claim
// in the rule's header (that punchy-fragments catches this genre only by accident), the suppression
// contexts, and the pair-consumption behavior on a run of beats.

import { describe, it, expect } from "vitest";
import { buildDocAnalysis } from "../build-doc.js";
import { punchyFragmentsRule } from "./fragments.js";
import { quantityHookRule } from "./quantity-hook.js";

const fires = (text: string) => quantityHookRule.detect(buildDocAnalysis(text));

// The genre, as collected. Every one of these is the same formula; what varies is only whether the
// second beat happens to contain something the chunker reads as a verb.
const GENRE = [
  "3 rules. And none you set.",
  "Twelve engineers. Zero tests.",
  "Two options. Neither one good.",
  "Six weeks of planning. Not one line shipped.",
  "A thousand dashboards. Nobody reading them.",
  "40% of enterprises. None of them ready.",
  "Fifteen meetings. No decisions.",
  "One question. Nobody could answer it.",
  "A dozen frameworks. None of them finished.",
];

describe("discourse/quantity-hook: the genre", () => {
  for (const text of GENRE) {
    it(`fires on ${JSON.stringify(text)}`, () => {
      expect(fires(text)).toHaveLength(1);
    });
  }

  it("covers the genre where punchy-fragments covers less than half of it", () => {
    // The rule header's central claim, pinned rather than asserted: punchy-fragments needs BOTH
    // beats to come back outcome === "fragment", so it tracks whether the negation happened to
    // contain a verb — which has nothing to do with the trope. If this ever reaches 9, the parse
    // changed underneath both rules and the header's reasoning needs re-reading, not the number.
    const punchy = GENRE.filter((t) => punchyFragmentsRule.detect(buildDocAnalysis(t)).length > 0);
    expect(punchy.length).toBeLessThan(GENRE.length / 2);
    expect(GENRE.filter((t) => fires(t).length > 0)).toHaveLength(GENRE.length);
  });
});

describe("discourse/quantity-hook: what it refuses", () => {
  it("leaves the disproportion variant alone, because a spec sheet has the same shape", () => {
    // Documented non-coverage, not an oversight — see the rule header. These two are structurally
    // identical and only semantics separates them.
    expect(fires("Four hours. One line of code.")).toHaveLength(0);
    expect(fires("2 eggs. 1 cup flour. A pinch of salt.")).toHaveLength(0);
  });

  it("needs the count beat to be verbless, so an ordinary two-sentence pair stays clean", () => {
    expect(fires("Twelve engineers are idle. None of them mind.")).toHaveLength(0);
    expect(fires("We shipped three rules and none of them helped.")).toHaveLength(0);
  });

  it("needs the second beat to void the count rather than modify it", () => {
    expect(fires("Twelve engineers. Half of them remote.")).toHaveLength(0);
    expect(fires("Three tickets. Two were duplicates.")).toHaveLength(0);
  });

  it("needs the voider near the front of the second beat, not buried in a clause", () => {
    expect(fires("Twelve engineers. The scheduler work is not done yet.")).toHaveLength(0);
  });

  it("ignores an ordinal, which enumerates rather than quantifies", () => {
    expect(fires("First rule. None you set.")).toHaveLength(0);
  });
});

describe("discourse/quantity-hook: suppression", () => {
  it("stays out of headings and bullet lists", () => {
    expect(fires("# 3 rules. And none you set.\n")).toHaveLength(0);
    expect(fires("- 3 rules. And none you set.\n")).toHaveLength(0);
  });

  it("stays out of quoted speech — the author is quoting the formula, not using it", () => {
    expect(fires('The post opened with "3 rules. And none you set." and went downhill.')).toHaveLength(0);
  });

  it("stays out of code fences", () => {
    expect(fires("```\n3 rules. And none you set.\n```\n")).toHaveLength(0);
  });
});

describe("discourse/quantity-hook: position and pairing", () => {
  it("reports medium when it opens the document and low when it does not", () => {
    expect(fires("3 rules. And none you set.")[0]!.severity).toBe("medium");
    const mid = fires("The rollout went fine everywhere else. Twelve engineers. Zero tests.");
    expect(mid[0]!.severity).toBe("low");
  });

  it("consumes both beats, so a run of three reports one pair and not two overlapping ones", () => {
    const findings = fires("Twelve engineers. Zero tests. No decisions.");
    expect(findings).toHaveLength(1);
  });

  it("reports each pair separately when the formula is used twice in a document", () => {
    const text = "3 rules. And none you set. The team moved on regardless. Fifteen meetings. No decisions.";
    expect(fires(text)).toHaveLength(2);
  });
});

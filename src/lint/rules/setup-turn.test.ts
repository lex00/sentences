// Behavior for rules/setup-turn.ts. The fixture battery (fixtures/setup-turn.ts) covers the
// fire/stay-silent shape on single specimens; this file covers what it cannot: the coverage claim
// in the rule's header (that punchy-fragments catches this genre only by accident), the suppression
// contexts, and the pair-consumption behavior on a run of beats.

import { describe, it, expect } from "vitest";
import { buildDocAnalysis } from "../build-doc.js";
import { punchyFragmentsRule } from "./fragments.js";
import { setupTurnRule } from "./setup-turn.js";

const fires = (text: string) => setupTurnRule.detect(buildDocAnalysis(text));

// The genre, as collected. Every one of these is the same formula; what varies is only whether the
// second beat happens to contain something the chunker reads as a verb.
const GENRE = [
  // with a count in the setup slot — what the first version of this rule (quantity-hook) covered
  "3 rules. And none you set.",
  "Twelve engineers. Zero tests.",
  "Two options. Neither one good.",
  "Six weeks of planning. Not one line shipped.",
  "A thousand dashboards. Nobody reading them.",
  "40% of enterprises. None of them ready.",
  "Fifteen meetings. No decisions.",
  "One question. Nobody could answer it.",
  "A dozen frameworks. None of them finished.",
  // ...and without one. Same formula, and the half the count-keyed version could not see.
  "A new framework. And nobody asked for it.",
  "Beautiful documentation. None of it true.",
  "Big launch day. No users.",
  "The perfect architecture. Not a single test.",
  "Endless meetings. No decisions.",
  "Great intentions. No follow-through.",
  "A shiny new dashboard. Nobody looking at it.",
  "An enormous backlog. Never groomed.",
  "First rule. None you set.",
];

describe("discourse/setup-turn: the genre", () => {
  for (const text of GENRE) {
    it(`fires on ${JSON.stringify(text)}`, () => {
      expect(fires(text)).toHaveLength(1);
    });
  }

  it("covers the whole genre; punchy-fragments covers part of it, decided by the parse", () => {
    // The rule header's central claim, pinned rather than asserted. punchy-fragments needs BOTH
    // beats to come back outcome === "fragment", so its coverage tracks whether the turn happened
    // to contain a verb — which has nothing to do with the trope. The four named below are the
    // header's table: each has a verb in the turn, so document.ts calls that unit "unparseable" and
    // fragments.ts (correctly, per its own header) will not treat it as a fragment.
    expect(GENRE.filter((t) => fires(t).length > 0)).toHaveLength(GENRE.length);

    const punchy = GENRE.filter((t) => punchyFragmentsRule.detect(buildDocAnalysis(t)).length > 0);
    expect(punchy.length).toBeLessThan(GENRE.length);
    for (const missed of [
      "3 rules. And none you set.",
      "A thousand dashboards. Nobody reading them.",
      "Six weeks of planning. Not one line shipped.",
      "A new framework. And nobody asked for it.",
    ]) {
      expect(punchyFragmentsRule.detect(buildDocAnalysis(missed))).toHaveLength(0);
      expect(fires(missed)).toHaveLength(1);
    }
  });
});

describe("discourse/setup-turn: what it refuses", () => {
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

  it("needs the turn to void the setup rather than modify it", () => {
    expect(fires("Twelve engineers. Half of them remote.")).toHaveLength(0);
    expect(fires("Three tickets. Two were duplicates.")).toHaveLength(0);
  });

  it("does not take ordinary verb negation for a void", () => {
    // "do not" negates a verb; the setup is still standing. This is what keeps the rule off
    // imperative prose — it was a live false positive on a markdown table cell in RESEARCH.md
    // before the auxiliary test went in.
    expect(fires("The report is finished. Do not rely on it for the quarterly numbers.")).toHaveLength(0);
    expect(fires("Image-download output. Do not rely on it.")).toHaveLength(0);
  });

  it("catches an irregular past tense in the setup, which no -ed test can see", () => {
    expect(fires("The old house stood empty. Nothing moved inside.")).toHaveLength(0);
  });

  it("needs the voider near the front of the second beat, not buried in a clause", () => {
    expect(fires("Twelve engineers. The scheduler work is not done yet.")).toHaveLength(0);
  });


});

describe("discourse/setup-turn: suppression", () => {
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

describe("discourse/setup-turn: position and pairing", () => {
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

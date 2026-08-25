// Tests for #15's fragment-tier rules. Two document builders are used deliberately:
//
//   docFromReadDocument(text)  — runs the REAL rule-based document path (document.ts's
//     readDocument) and wraps each DocUnit with tokenized words (offsets.ts's tokenizeWithSpans),
//     the same way analyze-document.ts does for the real pipeline. Use this whenever a test's point
//     is "the rule-based path really does classify this text as a fragment" — outcomes here are
//     earned, not asserted.
//
//   makeDoc(text, outcome)  — stub-doc.ts's synthetic builder. Its splitter also breaks on
//     newlines (document.ts's doesn't), which is exactly what the markdown-suppression tests need:
//     a heading or bullet line becomes its own clean unit instead of merging with the prose after
//     it. Outcomes are asserted via the `outcome` param, not earned.
import { describe, it, expect } from "vitest";
import { readDocument } from "../../document.js";
import { tokenizeWithSpans } from "../offsets.js";
import { makeDoc } from "../stub-doc.js";
import { textAt } from "../span.js";
import type { DocAnalysis, UnitAnalysis } from "../types.js";
import { countdownRule, punchyFragmentsRule } from "./fragments.js";

function docFromReadDocument(text: string): DocAnalysis {
  const units: UnitAnalysis[] = readDocument(text).map((d) => ({ ...d, words: tokenizeWithSpans(d.unit, d.span.start) }));
  return { text, units };
}

describe("discourse/punchy-fragments", () => {
  it("fires on the tropes.fyi example: a lowered opener then a run of short fragments", () => {
    const text = "He published this. Openly. In a book. As a priest.";
    const doc = docFromReadDocument(text);
    // earn the fragment outcomes rather than assume them
    expect(doc.units.map((u) => u.outcome)).toEqual(["lowered", "fragment", "fragment", "fragment"]);

    const findings = punchyFragmentsRule.detect(doc);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe("high"); // run of 3
    expect(textAt(doc, findings[0]!.span)).toBe("Openly. In a book. As a priest");
  });

  it("stays quiet on a document with only one intentional fragment", () => {
    const text =
      "This is one normal sentence about a topic. This is another normal sentence about it. " +
      "Sometimes intentional. This is a third normal sentence here. This is a fourth normal sentence too.";
    const doc = docFromReadDocument(text);
    const fragmentCount = doc.units.filter((u) => u.outcome === "fragment").length;
    expect(fragmentCount).toBe(1); // exactly one verbless unit — earned, not assumed
    expect(punchyFragmentsRule.detect(doc)).toEqual([]);
  });

  it("falls back to document-wide density when short fragments don't cluster into a run", () => {
    const text =
      "This introduction sets up the topic clearly for the reader. Sometimes intentional. " +
      "This is a normal sentence that follows along nicely. Another normal sentence follows here too. " +
      "Occasionally. This piece otherwise reads naturally throughout the whole thing.";
    const doc = docFromReadDocument(text);
    // two isolated short fragments, never adjacent — no run should form
    const findings = punchyFragmentsRule.detect(doc);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe("medium"); // 2/6 = 33%, clears medium not high
    expect(findings[0]!.message).toContain("2 short verbless fragments");
  });

  it('"Platforms do." parses as a complete two-word clause, not a fragment, and stays quiet alone', () => {
    const doc = docFromReadDocument("Platforms do.");
    expect(doc.units[0]!.outcome).toBe("lowered"); // documents the scope boundary — see fragments.ts header
    expect(punchyFragmentsRule.detect(doc)).toEqual([]);
  });

  it("a short reframe pair also earns a run finding under this rule's outcome-based contract", () => {
    // Both units come back "fragment" via the chunker's copula-losing bug (pinned in
    // document.test.ts), both are <= 4 words, and they are adjacent — that IS a run under this
    // rule's contract. See fragments.ts's header comment for why this is accepted, not patched.
    const doc = docFromReadDocument("It's not bold. It's backwards.");
    expect(doc.units.map((u) => u.outcome)).toEqual(["fragment", "fragment"]);
    const findings = punchyFragmentsRule.detect(doc);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe("medium"); // run of exactly 2
  });

  it("suppresses fragments that sit inside markdown structure (heading/bullet) via makeDoc", () => {
    const heading = "## Openly\n## In a book\n## As a priest";
    const plain = "Openly\nIn a book\nAs a priest";
    const asFragment = () => "fragment" as const;
    expect(punchyFragmentsRule.detect(makeDoc(heading, asFragment))).toEqual([]);
    // same content, no heading markers — fires, proving the suppression above is about structure
    const findings = punchyFragmentsRule.detect(makeDoc(plain, asFragment));
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe("high");

    const bulleted = "- Openly\n- In a book\n- As a priest";
    expect(punchyFragmentsRule.detect(makeDoc(bulleted, asFragment))).toEqual([]);
  });

  it("suppresses fragments dominated by a quoted span (bare quoted dialogue, no attribution)", () => {
    const text = '"Not a bug." "Not a feature." "Just broken."';
    const doc = docFromReadDocument(text);
    // sanity: these really do come back verbless on the rule-based path
    expect(doc.units.some((u) => u.outcome === "fragment")).toBe(true);
    expect(punchyFragmentsRule.detect(doc)).toEqual([]);
  });

  it("does NOT suppress a fragment that merely sits near an unrelated quoted word", () => {
    const text = 'She calls it "progress." Openly. In a book. As a priest.';
    const doc = docFromReadDocument(text);
    const findings = punchyFragmentsRule.detect(doc);
    expect(findings.length).toBeGreaterThan(0);
  });
});

describe("discourse/countdown", () => {
  it("fires on the tropes.fyi example at medium severity (2 negated + cap)", () => {
    const text = "Not a bug. Not a feature. A fundamental design flaw.";
    const doc = docFromReadDocument(text);
    expect(doc.units.map((u) => u.outcome)).toEqual(["fragment", "fragment", "fragment"]);

    const findings = countdownRule.detect(doc);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe("medium");
    expect(textAt(doc, findings[0]!.span)).toBe(text.slice(0, -1)); // whole run, terminal period excluded
  });

  it("escalates to high severity at 3+ negated fragments", () => {
    const text = "Not a bug. Not a feature. Not an oversight. A fundamental design flaw.";
    const doc = docFromReadDocument(text);
    const findings = countdownRule.detect(doc);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe("high");
  });

  it("does not fire on a single negated fragment (no countdown, just one negation)", () => {
    const doc = docFromReadDocument("Not a bug. Everything else here reads normally and calmly.");
    expect(countdownRule.detect(doc)).toEqual([]);
  });

  it("does not fire when the negated run has no cap (document ends mid-count)", () => {
    const doc = docFromReadDocument("Not a bug. Not a feature.");
    expect(countdownRule.detect(doc)).toEqual([]);
  });

  it('never treats "It\'s not X" as a negated opener — the initial token must literally be Not/No', () => {
    // Cross-rule precision case from the issue: "It's not bold. It's backwards." is a reframe
    // (negative parallelism), not a countdown. Both units come back "fragment" (bug in the
    // chunker, pinned in document.test.ts as "chunker loses the copula"), so outcome alone can't
    // save us here — the guard is requiring the literal first word token to be Not/No, and "It's"
    // (or "It", split by a real tokenizer) never is.
    const doc = docFromReadDocument("It's not bold. It's backwards.");
    expect(doc.units.map((u) => u.outcome)).toEqual(["fragment", "fragment"]);
    expect(countdownRule.detect(doc)).toEqual([]);
  });

  it("still recognizes a full-clause cap, not just a fragment cap", () => {
    // "must fire even when the capping unit is a full clause"
    const doc = docFromReadDocument("Not the color. Not the shape. This is exactly what I expected.");
    const findings = countdownRule.detect(doc);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe("medium");
  });

  it("suppresses a countdown that sits entirely inside quoted dialogue", () => {
    const text = '"Not a bug. Not a feature. A fundamental design flaw."';
    const doc = docFromReadDocument(text);
    expect(doc.units.some((u) => u.outcome === "fragment" && u.unit.toLowerCase().includes("not"))).toBe(true);
    expect(countdownRule.detect(doc)).toEqual([]);
  });

  it("suppresses a countdown whose units sit inside markdown headings, via makeDoc", () => {
    const heading = "## Not a bug\n## Not a feature\n## A fundamental design flaw";
    const plain = "Not a bug\nNot a feature\nA fundamental design flaw";
    const asFragment = () => "fragment" as const;
    expect(countdownRule.detect(makeDoc(heading, asFragment))).toEqual([]);
    expect(countdownRule.detect(makeDoc(plain, asFragment))).toHaveLength(1);
  });

  it("a document of normal prose with one intentional fragment stays clean of both rules", () => {
    const text =
      "This is one normal sentence about a topic. This is another normal sentence about it. " +
      "Sometimes intentional. This is a third normal sentence here. This is a fourth normal sentence too.";
    const doc = docFromReadDocument(text);
    expect(countdownRule.detect(doc)).toEqual([]);
    expect(punchyFragmentsRule.detect(doc)).toEqual([]);
  });
});

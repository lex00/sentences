// Round-trip fixtures for the fragment merge (#24). The bar is exact text: an input string, the
// output string it must produce, and a re-lint of that output showing the finding gone and nothing
// new in its place.
//
// Every fixture runs twice, under both analyzers, because they disagree about where a unit ends —
// stub-doc.ts keeps the terminator inside the unit span, document.ts's readDocument leaves it out —
// and a fixer that only worked under one of them would be a punctuation bug waiting for the app to
// switch analyzers (#9). Same input, same output, both paths.

import { describe, expect, it } from "vitest";
import { buildDocAnalysis } from "../../build-doc.js";
import { runRules } from "../../engine.js";
import { makeDoc } from "../../stub-doc.js";
import { countdownRule, punchyFragmentsRule } from "../../rules/fragments.js";
import type { DocAnalysis, Finding, TropeRule } from "../../types.js";
import { applyEdits, validateFix } from "../apply.js";
import { fixLoop } from "../loop.js";
import { defaultProvider } from "../registry.js";
import { countdownMergeFixer } from "./fragments.js";

const RULES: readonly TropeRule[] = [countdownRule, punchyFragmentsRule];

// The two analyzers, named so a failure says which path broke.
const ANALYZERS: ReadonlyArray<[string, (t: string) => DocAnalysis]> = [
  ["stub-doc", (t) => makeDoc(t, "fragment")],
  ["readDocument", buildDocAnalysis],
];

const countdownIn = (doc: DocAnalysis): Finding => {
  const hits = countdownRule.detect(doc);
  expect(hits).toHaveLength(1);
  return hits[0]!;
};

// input -> output, via the fixer alone: locate the finding, build the fix, check it is contained,
// apply it. No loop, so a failure here is the fixer's and not the acceptance test's.
function merge(text: string, analyze: (t: string) => DocAnalysis): string {
  const doc = analyze(text);
  const fix = countdownMergeFixer(countdownIn(doc), doc);
  expect(fix).not.toBeNull();
  expect(validateFix(text, fix!)).toBeNull();
  return applyEdits(text, fix!.edits);
}

describe("countdown merge — the reachable output", () => {
  // The issue illustrates this as "A design flaw, not a bug or a feature." — unreachable, because
  // "or" is not a word of the input and TextEdit has no insert. See the file header of
  // fixers/fragments.ts. This is the closest the edit algebra gets, and it is what ships.
  const BEFORE = "Not a bug. Not a feature. A fundamental design flaw.";
  const AFTER = "A fundamental design flaw, not a bug, not a feature.";

  for (const [name, analyze] of ANALYZERS) {
    it(`folds the runway into the cap (${name})`, () => {
      expect(merge(BEFORE, analyze)).toBe(AFTER);
    });

    it(`re-lints clean, with nothing new (${name})`, () => {
      const before = runRules(RULES, analyze(BEFORE));
      const after = runRules(RULES, analyze(AFTER));
      expect(before.findings.map((f) => f.ruleId)).toContain("discourse/countdown");
      expect(after.findings).toEqual([]);
      expect(after.errors).toEqual([]);
    });
  }

  it("adds nothing but commas, a space and two lowercased capitals", () => {
    // The output is the input's own characters: same multiset of letters and digits, in order.
    const letters = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
    expect(letters(AFTER).split("").sort().join("")).toEqual(letters(BEFORE).split("").sort().join(""));
  });
});

describe("countdown merge — longer runways and other caps", () => {
  const cases: ReadonlyArray<[string, string]> = [
    [
      "Not ten. Not fifty. Not a hundred. Five hundred lint violations.",
      "Five hundred lint violations, not ten, not fifty, not a hundred.",
    ],
    // "must fire even when the capping unit is a full clause" — the rule's contract, so the fixer
    // has to handle a cap with a verb in it too.
    [
      "Not a bug. Not a feature. This is a design flaw.",
      "This is a design flaw, not a bug, not a feature.",
    ],
  ];

  for (const [name, analyze] of ANALYZERS) {
    for (const [before, after] of cases) {
      it(`${JSON.stringify(before.slice(0, 24))}… (${name})`, () => {
        expect(merge(before, analyze)).toBe(after);
        expect(runRules(RULES, analyze(after)).findings.filter((f) => f.ruleId === "discourse/countdown")).toEqual([]);
      });
    }
  }
});

// A "No …" runway, stub-only: readDocument lowers "No warning" to a clause rather than a fragment,
// so the rule never fires on it there. That is the chunker's call about verblessness, not this
// fixer's, and the fixer has to handle the shape wherever the rule does report it.
describe("countdown merge — a lowercase-friendly runway", () => {
  it("needs no case repair on the cap and still lands the commas", () => {
    const before = "No warning. No rollback. The database was already gone.";
    expect(merge(before, (t) => makeDoc(t, "fragment"))).toBe("The database was already gone, no warning, no rollback.");
  });
});

describe("countdown merge — through the loop", () => {
  for (const [name, analyze] of ANALYZERS) {
    it(`accepts the fix and stops (${name})`, () => {
      const out = fixLoop(RULES, "Not a bug. Not a feature. A fundamental design flaw.", defaultProvider, { analyze });
      expect(out.text).toBe("A fundamental design flaw, not a bug, not a feature.");
      expect(out.after.findings).toEqual([]);
      expect(out.rejected).toEqual([]);
      expect(out.applied).toHaveLength(1);
      expect(out.iterations).toBeLessThan(5);
    });
  }
});

describe("countdown merge — when it declines", () => {
  it("returns null for a finding whose span holds no units", () => {
    const doc = makeDoc("Not a bug. Not a feature. A design flaw.", "fragment");
    const finding: Finding = { ...countdownIn(doc), span: { start: 0, end: 3 } };
    expect(countdownMergeFixer(finding, doc)).toBeNull();
  });

  it("returns null when the finding does not start where the runway starts", () => {
    const doc = makeDoc("Not a bug. Not a feature. A design flaw.", "fragment");
    const f = countdownIn(doc);
    expect(countdownMergeFixer({ ...f, span: { start: 1, end: f.span.end } }, doc)).toBeNull();
  });

  it("leaves a document with no countdown untouched", () => {
    const clean = "The build broke. Someone had pushed a bad merge.";
    const out = fixLoop(RULES, clean, defaultProvider, { analyze: buildDocAnalysis });
    expect(out.text).toBe(clean);
    expect(out.applied).toEqual([]);
  });
});

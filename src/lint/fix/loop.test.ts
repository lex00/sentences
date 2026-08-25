import { describe, it, expect } from "vitest";
import { runRules } from "../engine.js";
import { makeDoc } from "../stub-doc.js";
import { RULES } from "../registry.js";
import { demoIntensifierRule } from "../rules/demo.js";
import type { DocAnalysis, Finding, TropeRule } from "../types.js";
import { DEFAULT_MAX_ITERATIONS, fixLoop, remapThrough } from "./loop.js";
import { assertFixersHaveRules, defaultProvider, fixerFor } from "./registry.js";
import { REPAIR_AFFIX, findingKey } from "./types.js";
import type { Fix, FixProvider } from "./types.js";

const DEMO: readonly TropeRule[] = [demoIntensifierRule];
const lint = (t: string) => runRules(DEMO, makeDoc(t));

describe("the demo fixer, end to end", () => {
  it("deletes the word and closes the seam in front of it", () => {
    const out = fixLoop(DEMO, "This is a very good idea.", defaultProvider);
    expect(out.text).toBe("This is a good idea.");
    expect(out.after.findings).toEqual([]);
    expect(out.rejected).toEqual([]);
  });

  it("hands the capital to the next word when the tell started the sentence", () => {
    const out = fixLoop(DEMO, "Very really quite good.", defaultProvider);
    expect(out.text).toBe("Good.");
    expect(out.before.findings).toHaveLength(3);
    expect(out.after.findings).toEqual([]);
  });

  it("batches fixes that do not touch each other and defers the ones that do", () => {
    const out = fixLoop(DEMO, "Very really quite good.", defaultProvider);
    // Round 1 takes "Very" and "quite" together; "really" shares a seam with "Very" and waits.
    expect(out.steps[0]!.fixes).toHaveLength(2);
    expect(out.steps).toHaveLength(2);
    expect(out.applied).toHaveLength(3);
  });

  it("leaves a document with nothing to fix exactly as it was", () => {
    const clean = "He walked to the store and bought bread.";
    const out = fixLoop(DEMO, clean, defaultProvider);
    expect(out.text).toBe(clean);
    expect(out.applied).toEqual([]);
    expect(out.steps).toEqual([]);
  });

  it("reports before and after from the same linter the reader sees", () => {
    const text = "It is really quite clever.";
    const out = fixLoop(DEMO, text, defaultProvider);
    expect(out.before.findings.map((f) => f.span)).toEqual(lint(text).findings.map((f) => f.span));
    expect(out.after.findings).toEqual(lint(out.text).findings);
  });
});

describe("the registry", () => {
  it("only registers fixers for rules that exist", () => {
    expect(() => assertFixersHaveRules()).not.toThrow();
    expect(() => assertFixersHaveRules({ "nope/nope": () => null }, RULES)).toThrow(/unknown rule id/);
  });

  it("hands back nothing for a rule with no fixer, which is the default", () => {
    expect(fixerFor("demo/intensifier")).toBeDefined();
    expect(fixerFor("some/unfixed-rule")).toBeUndefined();
    const finding: Finding = {
      ruleId: "some/unfixed-rule",
      span: { start: 0, end: 1 },
      severity: "low",
      message: "m",
      explanation: "e",
    };
    expect(defaultProvider(finding, makeDoc("a b"))).toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------
// The acceptance test, exercised with rules built to fail it
// ---------------------------------------------------------------------------------------------

// Reports one finding per "#", so a fix that does not remove a "#" cannot reduce the count.
const hashRule: TropeRule = {
  id: "t/hash",
  name: "hash",
  tier: "lexical",
  detect: (doc) => {
    const out: Finding[] = [];
    for (let i = 0; i < doc.text.length; i++) {
      if (doc.text[i] === "#") {
        out.push({ ruleId: "t/hash", span: { start: i, end: i + 1 }, severity: "low", message: "#", explanation: "#" });
      }
    }
    return out;
  },
};

describe("acceptance — a fix has to earn its place", () => {
  it("reverts a fix that does not reduce the finding count, and never offers it again", () => {
    // A fixer that fiddles with punctuation next to the tell but never removes the tell itself.
    const useless: FixProvider = (f) => ({
      findingId: { ruleId: f.ruleId, span: { ...f.span } },
      edits: [{ kind: "repair", span: { start: f.span.end, end: f.span.end + 1 }, replacement: "" }],
    });
    const text = "a # b # c";
    const out = fixLoop([hashRule], text, useless);
    expect(out.text).toBe(text);
    expect(out.applied).toEqual([]);
    expect(out.rejected).toHaveLength(2);
    expect(out.rejected[0]!.reason).toMatch(/finding count did not fall/);
    // Two fixes, tried once each, then the candidate pool is empty: the loop cannot spin.
    expect(out.iterations).toBeLessThan(5);
  });

  it("reverts a fix that trades findings — fewer in total, but one of them is new", () => {
    // Five words, each a finding, plus one finding spanning "bb cc", plus a GHOST finding that only
    // appears once the document is down to three words. Removing "bb cc" is a net win on count and
    // still has to be refused: the ghost was not there before.
    const text = "aa bb cc dd ee";
    const wide = { start: text.indexOf("bb cc"), end: text.indexOf("bb cc") + 5 };
    const trap: TropeRule = {
      id: "t/trap",
      name: "trap",
      tier: "lexical",
      detect: (doc) => {
        const words = doc.units.flatMap((u) => u.words);
        const out: Finding[] = words.map((w) => ({
          ruleId: "t/trap",
          span: w.span,
          severity: "low" as const,
          message: "w",
          explanation: "w",
        }));
        if (doc.text.includes("bb cc")) {
          out.push({ ruleId: "t/wide", span: wide, severity: "low", message: "wide", explanation: "wide" });
        }
        if (words.length === 3) {
          out.push({ ruleId: "t/ghost", span: { start: 0, end: 2 }, severity: "low", message: "g", explanation: "g" });
        }
        return out;
      },
    };
    const cut: FixProvider = (f) =>
      f.ruleId === "t/wide"
        ? {
            findingId: { ruleId: f.ruleId, span: { ...f.span } },
            edits: [
              { kind: "delete", span: { ...f.span } },
              { kind: "repair", span: { start: f.span.start - 1, end: f.span.start }, replacement: "" },
            ],
          }
        : null;

    const out = fixLoop([trap], text, cut);
    expect(out.before.findings).toHaveLength(6);
    expect(out.text).toBe(text);
    expect(out.rejected).toHaveLength(1);
    expect(out.rejected[0]!.reason).toMatch(/introduced a new finding: t\/ghost/);
  });

  it("survives a fixer that throws and keeps fixing the rest of the document", () => {
    const angry: FixProvider = (f, doc) => {
      if (f.span.start === 0) throw new Error("nope");
      return defaultProvider(f, doc);
    };
    const out = fixLoop(DEMO, "Very good, but really quite fine.", angry);
    expect(out.rejected.some((r) => r.reason.includes("fixer threw: nope"))).toBe(true);
    expect(out.after.findings.length).toBeLessThan(out.before.findings.length);
    expect(out.text.startsWith("Very")).toBe(true); // the one whose fixer threw is untouched
  });

  it("rejects a fix that claims a different finding than the one it was handed", () => {
    const liar: FixProvider = (f) => ({
      findingId: { ruleId: f.ruleId, span: { start: f.span.start, end: f.span.end + 3 } },
      edits: [{ kind: "delete", span: { start: f.span.start, end: f.span.end + 3 } }],
    });
    const out = fixLoop([hashRule], "a # b # c", liar);
    expect(out.applied).toEqual([]);
    expect(out.rejected[0]!.reason).toMatch(/fix claims finding .* but was given/);
  });

  it("rejects a fix that reaches outside its own finding", () => {
    const greedy: FixProvider = (f) => ({
      findingId: { ruleId: f.ruleId, span: { ...f.span } },
      edits: [{ kind: "delete", span: { start: f.span.start, end: f.span.end + 3 } }],
    });
    const out = fixLoop([hashRule], "a # b # c", greedy);
    expect(out.applied).toEqual([]);
    expect(out.rejected[0]!.reason).toMatch(/falls outside the finding span/);
  });
});

describe("moves survive the loop", () => {
  // "B A" is the tell; putting A in front of B removes it, using the author's own letters.
  const orderRule: TropeRule = {
    id: "t/order",
    name: "order",
    tier: "syntactic",
    detect: (doc) => {
      const at = doc.text.indexOf("B A");
      return at < 0
        ? []
        : [{ ruleId: "t/order", span: { start: at, end: at + 3 }, severity: "low", message: "o", explanation: "o" }];
    },
  };
  const swap: FixProvider = (f) => ({
    findingId: { ruleId: f.ruleId, span: { ...f.span } },
    edits: [
      { kind: "move", span: { start: f.span.end - 1, end: f.span.end }, to: f.span.start },
      { kind: "repair", span: { start: f.span.end, end: f.span.end + 1 }, replacement: "" },
    ],
  });

  it("reorders the author's words and accepts the result", () => {
    const out = fixLoop([orderRule], "Here is B A ok.", swap);
    expect(out.text).toBe("Here is AB ok.");
    expect(out.after.findings).toEqual([]);
    expect(out.applied).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------------------------
// Property tests over generated documents
// ---------------------------------------------------------------------------------------------

// A tiny LCG (Numerical Recipes constants). Seeded explicitly so a failure is reproducible; no
// Math.random anywhere near a test that is supposed to prove something.
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

const FIXTURES = [
  "This is a very good idea.",
  "It is really quite clever.",
  "Very good.",
  "The result was extremely clear.",
  "She truly understood the problem.",
  "Nothing here is incredibly complicated.",
  "He walked to the store.",
  "Really, the answer was simple.",
  "We were very, very tired.",
  "Quite the opposite happened, and nobody noticed.",
  "The meeting ran long.",
  "That is truly, incredibly unhelpful.",
];

function generate(rand: () => number): string {
  const n = 3 + Math.floor(rand() * 6);
  const picked: string[] = [];
  for (let i = 0; i < n; i++) picked.push(FIXTURES[Math.floor(rand() * FIXTURES.length)]!);
  return picked.join(" ");
}

// Every character the fixer is allowed to leave behind: one the author already typed, one from the
// bounded repair alphabet, or the case-flip of a character the author typed.
function allowedChars(original: string): (c: string) => boolean {
  const present = new Set(original);
  return (c) => present.has(c) || REPAIR_AFFIX.has(c) || present.has(c.toLowerCase()) || present.has(c.toUpperCase());
}

describe("properties, over 200 generated documents", () => {
  const rand = lcg(20240823);
  const docs = Array.from({ length: 200 }, () => generate(rand));

  it("terminates well inside the iteration cap", () => {
    for (const text of docs) {
      const out = fixLoop(DEMO, text, defaultProvider);
      expect(out.iterations).toBeLessThan(DEFAULT_MAX_ITERATIONS);
      // Each accepted step strictly decreases the finding count, so the rounds are bounded by it.
      expect(out.steps.length).toBeLessThanOrEqual(out.before.findings.length + 1);
    }
  });

  it("ends with findings that are a subset of the ones it started with", () => {
    for (const text of docs) {
      const out = fixLoop(DEMO, text, defaultProvider);
      const carried = new Set<string>();
      for (const f of out.before.findings) {
        const key = remapThrough(f, out.steps);
        if (key) carried.add(key);
      }
      for (const f of out.after.findings) {
        expect(carried.has(findingKey(f)), `${f.ruleId} at [${f.span.start}, ${f.span.end}) in ${JSON.stringify(out.text)}`).toBe(true);
      }
      expect(out.after.findings.length).toBeLessThanOrEqual(out.before.findings.length);
    }
  });

  it("never leaves behind a character the author did not write", () => {
    for (const text of docs) {
      const out = fixLoop(DEMO, text, defaultProvider);
      const ok = allowedChars(text);
      for (const c of out.text) expect(ok(c), `${JSON.stringify(c)} in ${JSON.stringify(out.text)}`).toBe(true);
    }
  });

  it("is idempotent — a second pass finds nothing left to do", () => {
    for (const text of docs) {
      const once = fixLoop(DEMO, text, defaultProvider);
      const twice = fixLoop(DEMO, once.text, defaultProvider);
      expect(twice.text).toBe(once.text);
      expect(twice.applied).toEqual([]);
      expect(twice.steps).toEqual([]);
    }
  });

  it("is deterministic — same input, same output, every time", () => {
    for (const text of docs.slice(0, 40)) {
      const a = fixLoop(DEMO, text, defaultProvider);
      const b = fixLoop(DEMO, text, defaultProvider);
      expect(b.text).toBe(a.text);
      expect(b.applied).toEqual(a.applied);
      expect(b.iterations).toBe(a.iterations);
    }
  });

  it("only ever removes the author's words, never rearranges them, for a delete-only fixer", () => {
    // The demo fixer only deletes, so the output must be a subsequence of the input once the
    // capitalization repairs are normalized away.
    for (const text of docs) {
      const out = fixLoop(DEMO, text, defaultProvider).text.toLowerCase();
      const src = text.toLowerCase();
      let i = 0;
      for (const c of out) {
        i = src.indexOf(c, i);
        expect(i, `${JSON.stringify(c)} not found in order`).toBeGreaterThanOrEqual(0);
        i++;
      }
    }
  });
});

describe("a custom analyze hook", () => {
  it("is what the loop lints through, so the real analyzer can drop in later", () => {
    let calls = 0;
    const analyze = (t: string): DocAnalysis => {
      calls++;
      return makeDoc(t);
    };
    const out = fixLoop(DEMO, "This is a very good idea.", defaultProvider, { analyze });
    expect(calls).toBeGreaterThan(1); // once for the input, once per attempt
    expect(out.text).toBe("This is a good idea.");
  });

  it("cannot spin on a fix that changes nothing, and honours maxIterations regardless", () => {
    const noop: FixProvider = (f): Fix => ({
      findingId: { ruleId: f.ruleId, span: { ...f.span } },
      edits: [{ kind: "repair", span: { start: f.span.start, end: f.span.end }, replacement: "#" }],
    });
    const out = fixLoop([hashRule], "# #", noop, { maxIterations: 3 });
    expect(out.iterations).toBeLessThanOrEqual(3);
    expect(out.text).toBe("# #");
    expect(out.rejected.map((r) => r.reason)).toEqual([
      "finding count did not fall (2 -> 2)",
      "finding count did not fall (2 -> 2)",
    ]);
  });
});

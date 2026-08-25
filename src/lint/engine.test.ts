import { describe, it, expect } from "vitest";
import { runRules } from "./engine.js";
import { makeDoc, spanOf } from "./stub-doc.js";
import { textAt } from "./span.js";
import { RULES, enabledRules, getRule, assertUniqueRuleIds } from "./registry.js";
import { demoIntensifierRule } from "./rules/demo.js";
import type { DocAnalysis, Finding, Span, TropeRule } from "./types.js";

// A throwaway rule that reports one finding per span it is handed.
const at = (id: string, spans: Span[]): TropeRule => ({
  id,
  name: id,
  tier: "lexical",
  detect: () => spans.map((span) => ({ ruleId: id, span, severity: "low" as const, message: id, explanation: id })),
});

const boom = (id: string, message = "kaboom"): TropeRule => ({
  id,
  name: id,
  tier: "lexical",
  detect: () => { throw new Error(message); },
});

describe("runRules — the demo rule end to end", () => {
  const text = "This is a very good idea. It is really quite clever.";

  it("takes text in and gives located findings out", () => {
    const doc = makeDoc(text);
    const { findings, errors } = runRules([demoIntensifierRule], doc);
    expect(errors).toEqual([]);
    expect(findings.map((f) => textAt(doc, f.span))).toEqual(["very", "really", "quite"]);
    expect(findings[0]!.span).toEqual(spanOf(text, "very"));
  });

  it("uses whole-document density to set severity — the thing a per-sentence judge cannot do", () => {
    const sparse = runRules([demoIntensifierRule], makeDoc("This is a very good idea.")).findings;
    expect(sparse.map((f) => f.severity)).toEqual(["low"]);

    const dense = runRules([demoIntensifierRule], makeDoc(text)).findings;
    expect(dense.map((f) => f.severity)).toEqual(["medium", "medium", "medium"]);
    expect(dense[0]!.message).toContain("3 filler intensifiers");
  });

  it("names the pattern in the message and teaches it in the explanation", () => {
    const [f] = runRules([demoIntensifierRule], makeDoc(text)).findings as [Finding];
    expect(f.message.length).toBeLessThan(80);
    expect(f.explanation.length).toBeGreaterThan(f.message.length);
    expect(f.ruleId).toBe("demo/intensifier");
  });

  it("is deterministic: same input, byte-identical output", () => {
    const doc = makeDoc(text);
    const runs = [runRules(RULES, doc), runRules(RULES, doc), runRules(RULES, makeDoc(text))];
    for (const r of runs) expect(JSON.stringify(r)).toBe(JSON.stringify(runs[0]));
  });

  it("finds nothing in clean prose", () => {
    expect(runRules(RULES, makeDoc("The dog chased the ball across the yard.")).findings).toEqual([]);
  });
});

describe("runRules — ordering", () => {
  const doc = makeDoc("aaaa bbbb cccc");

  it("sorts by span.start, then span.end, then ruleId", () => {
    const rules = [
      at("z", [{ start: 5, end: 9 }, { start: 0, end: 4 }]),
      at("a", [{ start: 5, end: 9 }, { start: 5, end: 14 }]),
    ];
    expect(runRules(rules, doc).findings.map((f) => [f.ruleId, f.span.start, f.span.end])).toEqual([
      ["z", 0, 4], // earliest start
      ["a", 5, 9], // same start+end as z's: ruleId "a" < "z"
      ["z", 5, 9],
      ["a", 5, 14], // same start, longer: the nested finding came first
    ]);
  });

  it("orders ruleIds by code point, not by locale", () => {
    const rules = [at("Z-rule", [{ start: 0, end: 4 }]), at("a-rule", [{ start: 0, end: 4 }])];
    expect(runRules(rules, doc).findings.map((f) => f.ruleId)).toEqual(["Z-rule", "a-rule"]);
  });

  it("does not depend on the order the rules were passed in", () => {
    const a = at("a", [{ start: 5, end: 9 }]), z = at("z", [{ start: 0, end: 4 }]);
    const forward = runRules([a, z], doc).findings;
    const backward = runRules([z, a], doc).findings;
    expect(forward).toEqual(backward);
  });
});

describe("runRules — dedupe", () => {
  const doc = makeDoc("aaaa bbbb cccc");

  it("drops a repeat of the same ruleId at the same span, keeping the first", () => {
    const dup: Finding = { ruleId: "a", span: { start: 0, end: 4 }, severity: "high", message: "first", explanation: "first" };
    const rule: TropeRule = { id: "a", name: "a", tier: "lexical", detect: () => [dup, { ...dup, message: "second", explanation: "second" }] };
    const { findings } = runRules([rule], doc);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toBe("first");
  });

  it("keeps overlapping spans from DIFFERENT rules — two tells can land on the same words", () => {
    const rules = [at("negative-parallelism", [{ start: 0, end: 9 }]), at("em-dash", [{ start: 5, end: 14 }])];
    expect(runRules(rules, doc).findings).toHaveLength(2);
  });

  it("keeps overlapping spans from the SAME rule — a rule may nest findings", () => {
    const rule = at("tricolon", [{ start: 0, end: 14 }, { start: 0, end: 9 }]);
    expect(runRules([rule], doc).findings.map((f) => f.span.end)).toEqual([9, 14]);
  });

  it("dedupes across rules by the finding's own ruleId, not by the rule that emitted it", () => {
    const span = { start: 0, end: 4 };
    const emit = (id: string): TropeRule => ({
      id,
      name: id,
      tier: "lexical",
      detect: () => [{ ruleId: "shared", span, severity: "low", message: id, explanation: id }],
    });
    const { findings } = runRules([emit("one"), emit("two")], doc);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toBe("one");
  });
});

describe("runRules — error isolation", () => {
  const doc = makeDoc("aaaa bbbb cccc");

  it("a throwing rule does not kill the run; the others still report", () => {
    const { findings, errors } = runRules([boom("bad"), at("good", [{ start: 0, end: 4 }])], doc);
    expect(findings.map((f) => f.ruleId)).toEqual(["good"]);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.ruleId).toBe("bad");
    expect(errors[0]!.message).toContain("kaboom");
    expect(errors[0]!.error).toBeInstanceOf(Error);
  });

  it("a throwing rule contributes nothing at all — detect() is all-or-nothing", () => {
    const half: TropeRule = {
      id: "half",
      name: "half",
      tier: "lexical",
      detect: () => { throw new Error("threw after building findings"); },
    };
    expect(runRules([half], doc).findings).toEqual([]);
  });

  it("survives a rule that throws a non-Error", () => {
    const odd: TropeRule = { id: "odd", name: "odd", tier: "lexical", detect: () => { throw "just a string"; } };
    expect(runRules([odd], doc).errors[0]!.message).toContain("just a string");
  });

  it("drops a finding whose span does not fit the document, and says which rule did it", () => {
    const rules = [at("wild", [{ start: 0, end: 999 }, { start: 9, end: 2 }, { start: -1, end: 3 }, { start: 0, end: 4 }])];
    const { findings, errors } = runRules(rules, doc);
    expect(findings.map((f) => f.span)).toEqual([{ start: 0, end: 4 }]);
    expect(errors).toHaveLength(3);
    expect(errors.every((e) => e.ruleId === "wild")).toBe(true);
    expect(errors[0]!.message).toContain("does not fit");
  });

  it("reports errors in the order the rules were run", () => {
    const { errors } = runRules([boom("first", "a"), at("fine", []), boom("second", "b")], doc);
    expect(errors.map((e) => e.ruleId)).toEqual(["first", "second"]);
  });

  it("handles an empty rule list and an empty document", () => {
    expect(runRules([], doc)).toEqual({ findings: [], errors: [] });
    const empty: DocAnalysis = makeDoc("");
    expect(runRules(RULES, empty)).toEqual({ findings: [], errors: [] });
  });
});

describe("registry", () => {
  it("every registered rule has a unique id and the fields the UI needs", () => {
    expect(() => assertUniqueRuleIds()).not.toThrow();
    for (const r of RULES) {
      expect(r.id).toMatch(/\S/);
      expect(r.name).toMatch(/\S/);
      expect(typeof r.detect).toBe("function");
    }
  });

  it("catches a duplicate id, naming it", () => {
    expect(() => assertUniqueRuleIds([at("dup", []), at("dup", [])])).toThrow(/duplicate rule id: dup/);
  });

  it("enables every rule by default and disables only the ones toggled off", () => {
    expect(enabledRules().map((r) => r.id)).toEqual(RULES.map((r) => r.id));
    const withoutDemo = enabledRules({ "demo/intensifier": false });
    expect(withoutDemo.map((r) => r.id)).not.toContain("demo/intensifier");
    expect(withoutDemo).toHaveLength(RULES.length - 1);
    expect(enabledRules({ "demo/intensifier": true })).toHaveLength(RULES.length);
  });

  it("ignores toggles for rules that no longer exist, so stale settings still run", () => {
    expect(enabledRules({ "a-rule-we-deleted": false }).map((r) => r.id)).toEqual(RULES.map((r) => r.id));
  });

  it("looks a rule up by id", () => {
    expect(getRule("demo/intensifier")).toBe(demoIntensifierRule);
    expect(getRule("nope")).toBeUndefined();
  });
});

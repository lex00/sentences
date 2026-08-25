import { describe, it, expect } from "vitest";
import { countWords, scoreFindings, SEVERITY_WEIGHT, MIN_WORDS_FOR_SCORE, TIERS } from "./score.js";
import type { Finding, Severity, TropeTier } from "./types.js";

const finding = (ruleId: string, severity: Severity): Finding => ({
  ruleId,
  severity,
  span: { start: 0, end: 1 },
  message: "m",
  explanation: "e",
});

const noTier = (): TropeTier | undefined => undefined;
const tierOf =
  (map: Record<string, TropeTier>) =>
  (ruleId: string): TropeTier | undefined =>
    map[ruleId];

describe("countWords", () => {
  it("splits on whitespace, not on the tokenizer's word boundaries", () => {
    expect(countWords("The dog barked.")).toBe(3);
    expect(countWords("well-known, isn't")).toBe(2); // hyphenated/contracted stay one token each
  });

  it("is 0 for empty or whitespace-only input", () => {
    expect(countWords("")).toBe(0);
    expect(countWords("   \n\t  ")).toBe(0);
  });

  it("collapses runs of whitespace, including newlines", () => {
    expect(countWords("one\n\ntwo   three")).toBe(3);
  });
});

describe("scoreFindings", () => {
  it("scores zero findings as zero everywhere, with every tier and no rules present", () => {
    const s = scoreFindings([], 1000, noTier);
    expect(s.total).toBe(0);
    expect(s.byRule).toEqual({});
    for (const t of TIERS) expect(s.byTier[t]).toBe(0);
  });

  it("weights severities per SEVERITY_WEIGHT and normalizes to per-1000-words", () => {
    // One `low` (weight 1) in exactly 1000 words -> total is the weight itself.
    const s = scoreFindings([finding("r", "low")], 1000, noTier);
    expect(s.total).toBe(SEVERITY_WEIGHT.low);
    expect(s.total).toBe(1);
  });

  it("doubles per tier: high is worth exactly 4x low, medium exactly 2x low", () => {
    expect(SEVERITY_WEIGHT.high).toBe(4 * SEVERITY_WEIGHT.low);
    expect(SEVERITY_WEIGHT.medium).toBe(2 * SEVERITY_WEIGHT.low);
    expect(SEVERITY_WEIGHT.candidate).toBe(0.25 * SEVERITY_WEIGHT.low);

    const oneHigh = scoreFindings([finding("r", "high")], 1000, noTier).total;
    const fourLow = scoreFindings(
      [finding("a", "low"), finding("b", "low"), finding("c", "low"), finding("d", "low")],
      1000,
      noTier,
    ).total;
    expect(oneHigh).toBeCloseTo(fourLow, 10);
  });

  it("applies a floor so short documents don't produce wild per-1000-word scores", () => {
    const tiny = scoreFindings([finding("r", "high")], 5, noTier).total;
    const atFloor = scoreFindings([finding("r", "high")], MIN_WORDS_FOR_SCORE, noTier).total;
    expect(tiny).toBe(atFloor); // 5 words is below the floor, so both divide by the same floor
    expect(tiny).toBe((SEVERITY_WEIGHT.high / MIN_WORDS_FOR_SCORE) * 1000);
  });

  it("scales inversely with word count once above the floor", () => {
    const denser = scoreFindings([finding("r", "low")], 500, noTier).total;
    const sparser = scoreFindings([finding("r", "low")], 2000, noTier).total;
    expect(denser).toBeGreaterThan(sparser);
    expect(denser).toBeCloseTo(sparser * 4, 10);
  });

  it("breaks totals down by tier using the supplied ruleId -> tier lookup", () => {
    const findings = [finding("lex/a", "low"), finding("lex/a", "low"), finding("syn/b", "high")];
    const s = scoreFindings(findings, 1000, tierOf({ "lex/a": "lexical", "syn/b": "syntactic" }));
    expect(s.byTier.lexical).toBeCloseTo(2, 10);
    expect(s.byTier.syntactic).toBeCloseTo(4, 10);
    expect(s.byTier.formatting).toBe(0);
    expect(s.byTier.discourse).toBe(0);
    expect(s.total).toBeCloseTo(6, 10);
  });

  it("a finding whose rule has no known tier contributes to the total but no byTier bucket", () => {
    const s = scoreFindings([finding("mystery", "low")], 1000, noTier);
    expect(s.total).toBe(1);
    for (const t of TIERS) expect(s.byTier[t]).toBe(0);
  });

  it("breaks totals down by rule, with keys sorted regardless of finding order", () => {
    const findings = [finding("zzz", "low"), finding("aaa", "high"), finding("aaa", "low")];
    const s = scoreFindings(findings, 1000, noTier);
    expect(Object.keys(s.byRule)).toEqual(["aaa", "zzz"]);
    expect(s.byRule.aaa).toBeCloseTo(5, 10); // one high (4) + one low (1)
    expect(s.byRule.zzz).toBeCloseTo(1, 10);
  });

  it("is deterministic: same findings and word count, same score, every call", () => {
    const findings = [finding("a", "medium"), finding("b", "candidate"), finding("a", "high")];
    const lookup = tierOf({ a: "lexical", b: "discourse" });
    const runs = [scoreFindings(findings, 1200, lookup), scoreFindings(findings, 1200, lookup)];
    expect(runs[1]).toEqual(runs[0]);
  });
});

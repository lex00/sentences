import { describe, it, expect } from "vitest";
import { findingKey, openIndices } from "./diagram-panels.js";
import type { Finding } from "../lint/types.js";

const finding = (ruleId: string, start: number, end: number, extra: Partial<Finding> = {}): Finding => ({
  ruleId,
  span: { start, end },
  severity: "low",
  message: "m",
  explanation: "e",
  ...extra,
});

describe("findingKey", () => {
  it("is the same for two findings with the same ruleId and span, even with different messages", () => {
    const a = finding("lex-delve-family", 3, 8, { message: "one", severity: "low" });
    const b = finding("lex-delve-family", 3, 8, { message: "totally different", severity: "medium" });
    expect(findingKey(a)).toBe(findingKey(b));
  });

  it("differs when the span differs", () => {
    expect(findingKey(finding("r", 0, 5))).not.toBe(findingKey(finding("r", 0, 6)));
  });

  it("differs when the ruleId differs, even at the same span", () => {
    expect(findingKey(finding("a", 0, 5))).not.toBe(findingKey(finding("b", 0, 5)));
  });
});

describe("openIndices", () => {
  it("is empty when nothing is open", () => {
    const findings = [finding("a", 0, 5), finding("b", 5, 10)];
    expect(openIndices(findings, new Set())).toEqual([]);
  });

  it("finds the new index of a finding that moved after a re-lint", () => {
    const before = [finding("a", 0, 5), finding("b", 5, 10)];
    const openKeys = new Set([findingKey(before[1]!)]); // "b" was open
    // re-lint reorders: "b" is now first
    const after = [finding("b", 5, 10), finding("a", 0, 5)];
    expect(openIndices(after, openKeys)).toEqual([0]);
  });

  it("drops a finding that disappeared after a re-lint (a rule was toggled off)", () => {
    const openKeys = new Set([findingKey(finding("gone", 2, 4))]);
    const after = [finding("a", 0, 5)];
    expect(openIndices(after, openKeys)).toEqual([]);
  });

  it("reports every matching index when several panels are open", () => {
    const findings = [finding("a", 0, 5), finding("b", 5, 10), finding("c", 10, 15)];
    const openKeys = new Set([findingKey(findings[0]!), findingKey(findings[2]!)]);
    expect(openIndices(findings, openKeys)).toEqual([0, 2]);
  });
});

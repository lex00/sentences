import { describe, it, expect } from "vitest";
import { runRules } from "../engine.js";
import { buildDocAnalysis } from "../build-doc.js";
import { spanOf } from "../stub-doc.js";
import { aphoristicEnderRule } from "./aphoristic-ender.js";

// Two full-length sentences: the runway the rule requires before an ender can land.
const RUNWAY =
  "The migration took three quarters and touched every service we own. " +
  "We rewrote the scheduler twice before the numbers finally moved.";

const run = (text: string) => runRules([aphoristicEnderRule], buildDocAnalysis(text)).findings;

describe("claude/aphoristic-ender", () => {
  it("fires on a verbless ender with an 'X, not Y' tail, spanning just the ender", () => {
    const text = `${RUNWAY} A choice, not an accident.`;
    const findings = run(text);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.ruleId).toBe("claude/aphoristic-ender");
    expect(findings[0]!.span).toEqual(spanOf(text, "A choice, not an accident"));
    expect(findings[0]!.message).toContain("comma-inverted contrast");
  });

  it("fires on a copular ender carrying the same contrast", () => {
    const text = `${RUNWAY} The rollout was a stance, not its absence.`;
    const findings = run(text);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.span).toEqual(spanOf(text, "The rollout was a stance, not its absence"));
  });

  it("fires on a verbless mirrored pair of equal halves", () => {
    const text = `${RUNWAY} Big promises, small results.`;
    const findings = run(text);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toContain("a mirrored pair");
  });

  it("stays silent on a short final sentence that is a plain statement", () => {
    expect(run(`${RUNWAY} The build passed.`)).toEqual([]);
  });

  it("stays silent on an ender with no rhetorical shape at all", () => {
    expect(run(`${RUNWAY} A long quarter.`)).toEqual([]);
  });

  it("stays silent when the aphorism is quoted rather than written", () => {
    expect(run(`${RUNWAY} "A choice, not an accident".`)).toEqual([]);
  });

  it("stays silent without a runway of two longer units", () => {
    expect(run("We shipped it. A choice, not an accident.")).toEqual([]);
  });

  it("stays silent on an appositive fragment whose halves are lopsided", () => {
    expect(run(`${RUNWAY} Tuesday, the day after the outage.`)).toEqual([]);
  });

  it("stays silent inside a bullet list", () => {
    const text =
      "- The migration took three quarters and touched every service we own. " +
      "We rewrote the scheduler twice before the numbers finally moved. A choice, not an accident.";
    expect(run(text)).toEqual([]);
  });

  it("escalates by document: one ender is low, two medium, three high", () => {
    const para = (ender: string) => `${RUNWAY} ${ender}`;
    const one = run(para("A choice, not an accident."));
    expect(one.map((f) => f.severity)).toEqual(["low"]);

    const two = run([para("A choice, not an accident."), para("A stance, not its absence.")].join("\n\n"));
    expect(two).toHaveLength(2);
    expect(new Set(two.map((f) => f.severity))).toEqual(new Set(["medium"]));

    const three = run(
      [para("A choice, not an accident."), para("A stance, not its absence."), para("A cost, not a gift.")].join("\n\n"),
    );
    expect(three).toHaveLength(3);
    expect(new Set(three.map((f) => f.severity))).toEqual(new Set(["high"]));
    expect(three[0]!.explanation).toContain("3 of this piece's paragraphs");
  });

  it("only ever reports the LAST unit of a paragraph", () => {
    const text = `A choice, not an accident. ${RUNWAY} The build passed.`;
    expect(run(text)).toEqual([]);
  });

  it("is deterministic", () => {
    const text = `${RUNWAY} A choice, not an accident.`;
    expect(JSON.stringify(run(text))).toBe(JSON.stringify(run(text)));
  });
});

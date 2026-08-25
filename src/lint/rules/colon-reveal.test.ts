import { describe, it, expect } from "vitest";
import { buildDocAnalysis } from "../build-doc.js";
import { makeDoc } from "../stub-doc.js";
import { readDocument } from "../../document.js";
import { textAt } from "../span.js";
import { colonRevealRule } from "./colon-reveal.js";

const fire = (text: string) => colonRevealRule.detect(makeDoc(text));
const only = (text: string) => {
  const findings = fire(text);
  expect(findings).toHaveLength(1);
  return findings[0]!;
};

describe("claude/colon-reveal — reading the colon out of either builder", () => {
  it("readDocument leaves the ':' in the gap between the two unit spans", () => {
    const text = "Priya's take: automate everything you safely can.";
    const units = readDocument(text);
    expect(units).toHaveLength(2);
    expect(units[0]!.unit).toBe("Priya's take");
    expect(text.slice(units[0]!.span.end, units[1]!.span.start)).toContain(":");
  });

  it("finds the same reveal through both document builders, with the same span", () => {
    const text = "Priya's take: automate everything you safely can.";
    const parsed = colonRevealRule.detect(buildDocAnalysis(text));
    const stubbed = fire(text);
    expect(stubbed.map((f) => f.span)).toEqual(parsed.map((f) => f.span));
    expect(textAt(makeDoc(text), stubbed[0]!.span)).toBe("Priya's take");
  });
});

describe("claude/colon-reveal — the label arm", () => {
  it.each([
    "Priya's take: automate everything you safely can.",
    "The result: every deploy got two minutes faster.",
    "His argument: the audit model was never built for this.",
    "The fix: move the check into the build step.",
  ])("fires once on %j", (text) => {
    expect(only(text).ruleId).toBe("claude/colon-reveal");
  });

  it("spans the label's words, colon excluded, so both builders agree", () => {
    const text = "The fix: move the check into the build step.";
    expect(textAt(makeDoc(text), only(text).span)).toBe("The fix");
  });

  it("ignores a long setup that is a sentence rather than a nameplate", () => {
    expect(fire("The whole reason we moved the check into the build step: it was cheaper there.")).toEqual([]);
  });

  it("ignores a one-word payoff — that is a caption, not a reveal beat", () => {
    expect(fire("The result: devastating.")).toEqual([]);
  });
});

describe("claude/colon-reveal — the appositive arm", () => {
  it("fires on the '…: one where …' restatement", () => {
    const text = "The pitch is for an engineering-first security model: one where security teams help build the guardrails.";
    expect(textAt(makeDoc(text), only(text).span)).toBe("model: one where");
  });

  it("takes the other listed openers too", () => {
    expect(fire("They wanted a different kind of review process: one that runs before the code is written.")).toHaveLength(1);
    expect(fire("They were building a rather unusual sort of company: the kind that never ships anything at all.")).toHaveLength(1);
  });

  it("leaves an ordinary explanatory colon after a long sentence alone", () => {
    expect(fire("The migration failed for the same reason it failed last time: the index was missing.")).toEqual([]);
  });
});

describe("claude/colon-reveal — suppressions", () => {
  it("suppresses a markdown heading label", () => {
    const text = "## Results:\n\nThe migration cut tail latency by half.";
    expect(fire(text)).toEqual([]);
    expect(colonRevealRule.detect(buildDocAnalysis(text))).toEqual([]);
  });

  it("suppresses list-item labels", () => {
    expect(fire("- Timeout: thirty seconds by default\n- Retries: three attempts before failover")).toEqual([]);
  });

  it("suppresses conventional labels", () => {
    for (const label of ["Note", "Warning", "Example", "Source", "Update"]) {
      expect(fire(`${label}: the migration runs twice on the first day.`)).toEqual([]);
    }
  });

  it("suppresses TL;DR, whose ';' makes it two units of its own", () => {
    expect(fire("TL;DR: the outage was caused by a stale cache key.")).toEqual([]);
  });

  it("suppresses a timestamp colon", () => {
    expect(fire("Standup is at 9:30 sharp every weekday morning.")).toEqual([]);
  });

  it("suppresses a URL colon", () => {
    expect(fire("The setup guide lives here: https://example.com/guide for anyone who needs it.")).toEqual([]);
  });
});

describe("claude/colon-reveal — severity and voice", () => {
  it("one reveal is low, two or more is medium", () => {
    expect(only("The fix: move the check into the build step.").severity).toBe("low");
    const findings = fire("The fix: move the check into the build step. The result: every deploy got faster.");
    expect(findings).toHaveLength(2);
    expect(findings.every((f) => f.severity === "medium")).toBe(true);
  });

  it("names the label in the message and teaches in the explanation", () => {
    const f = only("Priya's take: automate everything you safely can.");
    expect(f.message).toContain("Priya's take");
    expect(f.explanation.length).toBeGreaterThan(40);
  });
});

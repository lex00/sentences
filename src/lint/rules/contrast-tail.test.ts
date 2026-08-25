import { describe, it, expect } from "vitest";
import { buildDocAnalysis } from "../build-doc.js";
import { makeDoc } from "../stub-doc.js";
import { textAt } from "../span.js";
import { contrastTailRule } from "./contrast-tail.js";
import { reframeRule } from "./reframe.js";

const fire = (text: string) => contrastTailRule.detect(makeDoc(text));
const only = (text: string) => {
  const findings = fire(text);
  expect(findings).toHaveLength(1);
  return findings[0]!;
};

describe("claude/contrast-tail — the shape", () => {
  it("fires on the motivating post's closing clause", () => {
    const text = "Bake governance into the design phase, not the end of the pipeline.";
    const f = only(text);
    expect(textAt(makeDoc(text), f.span)).toBe("not the end of the pipeline");
    expect(f.ruleId).toBe("claude/contrast-tail");
  });

  it("fires on the 'never' opener", () => {
    const text = "Ship the small safe change, never the grand rewrite.";
    expect(textAt(makeDoc(text), only(text).span)).toBe("never the grand rewrite");
  });

  it("fires on the 'but not' opener", () => {
    const text = "Send the summary to the whole team, but not the raw incident log.";
    expect(textAt(makeDoc(text), only(text).span)).toBe("but not the raw incident log");
  });

  it("fires on the ordinary human version too — the linter shows the shape, it does not scold", () => {
    expect(fire("She chose the red one, not the blue one.")).toHaveLength(1);
  });

  it("reports the same span under either document builder", () => {
    const text = "Bake governance into the design phase, not the end of the pipeline.";
    expect(contrastTailRule.detect(buildDocAnalysis(text)).map((f) => f.span)).toEqual(fire(text).map((f) => f.span));
  });
});

describe("claude/contrast-tail — severity climbs with the habit", () => {
  const one = "Bake governance into the design phase, not the end of the pipeline.";
  const two = "Ship the small safe change, never the grand rewrite.";
  const three = "Write the runbook for the on-call engineer, not the compliance auditor.";

  it("a single instance is a candidate — people write this on purpose", () => {
    expect(only(one).severity).toBe("candidate");
  });

  it("two is low", () => {
    const findings = fire(`${one} ${two}`);
    expect(findings).toHaveLength(2);
    expect(findings.every((f) => f.severity === "low")).toBe(true);
  });

  it("three or more is medium, and the explanation says how many", () => {
    const findings = fire(`${one} ${two} ${three}`);
    expect(findings).toHaveLength(3);
    expect(findings.every((f) => f.severity === "medium")).toBe(true);
    expect(findings[0]!.explanation).toContain("3 sentences");
  });
});

describe("claude/contrast-tail — must NOT fire", () => {
  it("leaves the because-variant to rules/reframe.ts", () => {
    const text = "It was hard, not because of the schedule but because the whole team quit.";
    expect(fire(text)).toEqual([]);
    // ...and reframe.ts does own it, so the pattern is reported exactly once across the two rules.
    expect(reframeRule.detect(buildDocAnalysis(text)).length).toBeGreaterThan(0);
  });

  it("leaves a short denial of a bare noun alone — that is ordinary compression", () => {
    expect(fire("That was a paper cut, not a blocker.")).toEqual([]);
    expect(fire("The eyes didn't reach her eyes, not really.")).toEqual([]);
  });

  it("stays out of tails carrying a verb — those are clauses", () => {
    expect(fire("We shipped the parser, not having finished the renderer yet.")).toEqual([]);
    expect(fire("Write idiomatic Go, not the translated Java we had before.")).toEqual([]);
  });

  it("ignores a trailing comma clause that is not a denial", () => {
    expect(fire("The build failed twice, and nobody noticed until Friday.")).toEqual([]);
  });

  it("ignores a 'not' that is not in the last comma segment", () => {
    expect(fire("It is not the schedule, and it never was.")).toEqual([]);
  });

  it("needs a host sentence in front of the comma", () => {
    expect(fire("Here, not the far side of the room.")).toEqual([]);
  });

  it("stops at the upper length bound, where the tail stops being a phrase", () => {
    expect(fire("Put it in the design phase, not the end of the very long and winding pipeline.")).toEqual([]);
  });
});

describe("claude/contrast-tail — teaching voice", () => {
  it("quotes the tail in the message and teaches in the explanation", () => {
    const f = only("Bake governance into the design phase, not the end of the pipeline.");
    expect(f.message).toContain("not the end of the pipeline");
    expect(f.explanation.length).toBeGreaterThan(40);
  });
});

import { describe, it, expect } from "vitest";
import { buildDocAnalysis } from "../build-doc.js";
import { makeDoc } from "../stub-doc.js";
import { textAt } from "../span.js";
import { tricolonSeriesRule } from "./tricolon-series.js";
import { tricolonRule } from "./tricolon.js";

const fire = (text: string) => tricolonSeriesRule.detect(makeDoc(text));
const only = (text: string) => {
  const findings = fire(text);
  expect(findings).toHaveLength(1);
  return findings[0]!;
};

// The post that motivated #34's recall round, reworded off the real names.
const SAMPLE =
  "The pitch is for an engineering-first security model: one where security teams contribute code, " +
  "iterate alongside engineering, and help build the guardrails from day one rather than reviewing after the fact. " +
  "Her advice: automate everything you safely can, keep humans in the loop only where risk demands it, " +
  "and bake governance into the design phase, not the end of the pipeline.";

describe("tricolon/comma-series — the recall gap it exists to close", () => {
  it("fires on both series of the motivating sample, through the real document splitter", () => {
    const doc = buildDocAnalysis(SAMPLE);
    const findings = tricolonSeriesRule.detect(doc);
    expect(findings).toHaveLength(2);
    expect(textAt(doc, findings[0]!.span)).toBe(
      "one where security teams contribute code, iterate alongside engineering, and help build the guardrails from day one rather than reviewing after the fact",
    );
    expect(textAt(doc, findings[1]!.span)).toBe(
      "automate everything you safely can, keep humans in the loop only where risk demands it, and bake governance into the design phase",
    );
  });

  it("reports the same spans under makeDoc, which folds the terminator into the unit", () => {
    const parsed = tricolonSeriesRule.detect(buildDocAnalysis(SAMPLE)).map((f) => f.span);
    const stubbed = tricolonSeriesRule.detect(makeDoc(SAMPLE)).map((f) => f.span);
    expect(stubbed).toEqual(parsed);
  });

  it("sees what the IR rule cannot: the same comma list produces no Compound at all", () => {
    const text = "She bought apples, bananas, cherries, and dates.";
    // rules/tricolon.ts's own fixture records this limit; pinned here so the two stay in step.
    expect(tricolonRule.detect(buildDocAnalysis(text))).toEqual([]);
    expect(tricolonSeriesRule.detect(buildDocAnalysis(text))).toHaveLength(1);
  });
});

describe("tricolon/comma-series — shapes", () => {
  it("reads the Oxford form", () => {
    const text = "We tested it, we shipped it, and we watched it burn.";
    expect(textAt(makeDoc(text), only(text).span)).toBe("We tested it, we shipped it, and we watched it burn");
  });

  it("reads the no-Oxford form, where the coordinator hides in the last segment", () => {
    const text = "Hire quickly, train carefully and ship on time.";
    expect(textAt(makeDoc(text), only(text).span)).toBe("Hire quickly, train carefully and ship on time");
  });

  it("reads an 'or' series the same way", () => {
    expect(fire("Rewrite the module, patch the caller, or delete the feature.")).toHaveLength(1);
  });

  it("stops the series at the coordinated item, leaving a trailing ', not …' out of the span", () => {
    const text = "Bake it in early, keep the humans in the loop, and write it down, not at the very end.";
    const f = only(text);
    expect(textAt(makeDoc(text), f.span)).toBe("Bake it in early, keep the humans in the loop, and write it down");
  });

  it("counts a comma splice of three clauses as a tricolon", () => {
    expect(fire("I came here, I saw the whole mess, and I fixed the build.")).toHaveLength(1);
  });
});

describe("tricolon/comma-series — severity", () => {
  it("three items is low: visible on a single hit, but the gentlest weight there is", () => {
    expect(only("We tested it, we shipped it, and we watched it burn.").severity).toBe("low");
  });

  it("four or five items is medium", () => {
    expect(only("The rollout covered logging, alerting, tracing, dashboards, and paging.").severity).toBe("medium");
  });

  it("six or more is high", () => {
    expect(only("It covered logging, alerting, tracing, dashboards, paging, runbooks, and drills.").severity).toBe("high");
  });
});

describe("tricolon/comma-series — precision guards", () => {
  it("stays silent on two coordinated items", () => {
    expect(fire("The team shipped the parser and the renderer on Tuesday.")).toEqual([]);
  });

  it("stays silent on a three-item bare-noun enumeration", () => {
    expect(fire("She bought apples, bananas, and cherries.")).toEqual([]);
  });

  it("fires on a bare-noun list once it runs to four items", () => {
    expect(fire("She bought apples, bananas, cherries, and dates.")).toHaveLength(1);
  });

  it("never builds an item out of a date's comma", () => {
    expect(fire("The contract was signed on May 1, 2024, and filed the same week.")).toEqual([]);
  });

  it("refuses long segments — those are clauses, not list items", () => {
    const text =
      "Because the cache had gone stale after a long weekend of unattended traffic, the whole request path " +
      "slowed to a crawl for every customer in the region, and the on-call engineer spent four hours chasing it.";
    expect(fire(text)).toEqual([]);
  });

  it("lets the FINAL item run longer, since it carries the series' trailing adjunct", () => {
    const text = "Teams contribute code, iterate alongside engineering, and help build the guardrails from day one rather than reviewing after the fact.";
    expect(fire(text)).toHaveLength(1);
  });

  it("does not join a series across a unit boundary", () => {
    expect(fire("We tested it. We shipped it. And we watched it burn.")).toEqual([]);
  });
});

describe("tricolon/comma-series — deferring to the IR rule", () => {
  it("suppresses its own finding where rules/tricolon.ts already flagged the same span", () => {
    // Repeated bare "and" coordination DOES lower to a real Compound (tricolon.ts's own fixture),
    // so this unit is the IR rule's; adding a comma series to the same unit must not double-report.
    const text = "It was quick and quiet and cheap and simple, fast and cheap, and easy.";
    const doc = buildDocAnalysis(text);
    const ir = tricolonRule.detect(doc).filter((f) => f.ruleId === "tricolon/density");
    expect(ir.length).toBeGreaterThan(0);
    expect(tricolonSeriesRule.detect(doc)).toEqual([]);
  });

  it("is not silenced by the whole-document density finding, whose span covers everything", () => {
    const text =
      "It was quick and quiet and cheap and simple. It was cold and dark and damp and grim. " +
      "It was small and neat and tidy and plain. We tested it, we shipped it, and we watched it burn.";
    const doc = buildDocAnalysis(text);
    expect(tricolonRule.detect(doc).some((f) => f.ruleId === "tricolon/document-density")).toBe(true);
    expect(tricolonSeriesRule.detect(doc)).toHaveLength(1);
  });
});

describe("tricolon/comma-series — teaching voice", () => {
  it("names the series in the message and teaches in the explanation", () => {
    const f = only("We tested it, we shipped it, and we watched it burn.");
    expect(f.message).toContain("3-item comma series");
    expect(f.explanation.length).toBeGreaterThan(40);
  });
});

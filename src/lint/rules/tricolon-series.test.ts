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
    // Items that do NOT share an opening word: a plain enumeration, which is the gentle case.
    // ("We tested it, we shipped it, and we watched it burn" used to stand here and no longer
    // can — every item opens on "we", which is the rhetorical form and now reports a step up.)
    expect(only("The parser is fast, the layout is tidy, and the export works.").severity).toBe("low");
  });

  // A shared opening is what separates a figure of speech from a list: naming three things is an
  // enumeration, saying one thing three times in the same frame is rhetoric, and a reader hears
  // the difference immediately.
  it("bumps a step when every item opens on the same word", () => {
    const f = only("We tested it, we shipped it, and we watched it burn.");
    expect(f.severity).toBe("medium");
    expect(f.message).toContain("every item opening on “we”");
  });

  it("does not bump a series whose items merely start with the same letter", () => {
    expect(only("The parser is fast, the layout is tidy, and the export works.").message).not.toContain("every item opening");
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

// A parenthesised enumeration carries its own commas. Counting them as separators made the
// sentence around the aside look like a series it is not — reported on a real LinkedIn post, where
// deleting the parenthetical left an identical sentence that came back clean.
describe("commas inside brackets are the aside's, not the sentence's", () => {
  const WITH = "A team with guardrails (automated tests, code checks, a real review process) can hand work to AI and ship value quickly because anything bad gets caught before it lands.";
  const WITHOUT = "A team with guardrails can hand work to AI and ship value quickly because anything bad gets caught before it lands.";

  it("does not fire on a sentence whose only commas are inside a parenthetical", () => {
    expect(fire(WITH)).toEqual([]);
  });

  it("agrees with the same sentence carrying no parenthetical at all", () => {
    expect(fire(WITH)).toEqual(fire(WITHOUT));
  });

  it("still fires on a real series that happens to contain a parenthetical item", () => {
    const text = "The pass was fast, correct (measured twice), and small.";
    expect(fire(text).length).toBeGreaterThan(0);
  });

  it("handles square brackets the same way", () => {
    expect(fire("A team with guardrails [tests, checks, review] can hand work to AI and ship value quickly.")).toEqual([]);
  });

  it("is not thrown by an unbalanced bracket", () => {
    expect(() => fire("A list (a, b, c and d without a close")).not.toThrow();
  });
});

// A list of people is a byline, not a figure of speech. Reported from a real LinkedIn post where
// "Kavanaugh Latiolais, Michael and I get into this" came back as a 3-item comma series.
describe("a name list is not a tricolon", () => {
  it("stays silent on a coordination of people", () => {
    expect(fire("Kavanaugh Latiolais, Michael and I get into this and more on the episode.")).toEqual([]);
  });

  it("stays silent on a coordination of companies", () => {
    expect(fire("Apple, Google and Meta all shipped one this year.")).toEqual([]);
  });

  it("still fires when the items carry content rather than identity", () => {
    expect(fire("It brings together cost optimization, Kubernetes best practices, HPA, autoscaling, and CI/CD efficiency.").length).toBeGreaterThan(0);
    expect(fire("Products impress people, platforms empower them and frameworks outlive both.").length).toBeGreaterThan(0);
  });

  // Capitalisation only means something away from the sentence's first word, so the test looks at
  // the items after the first. A lowercase content word in any of them and this is a real series.
  it("is not fooled by a capitalised opening word alone", () => {
    expect(fire("Kubernetes needs tuning, careful review and real observability.").length).toBeGreaterThan(0);
  });
});

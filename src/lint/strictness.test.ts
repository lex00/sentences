import { describe, it, expect } from "vitest";
import {
  DEFAULT_STRICTNESS,
  SEVERITY_LADDER,
  STRICTNESS_LEVELS,
  floorAt,
  isStrictness,
  rateAt,
  severityAt,
  shiftSeverity,
} from "./strictness.js";
import { SEVERITY_WEIGHT } from "./score.js";
import { runRules } from "./engine.js";
import { makeDoc } from "./stub-doc.js";
import type { DocAnalysis, Finding, TropeRule } from "./types.js";

describe("the dial", () => {
  it("defaults to 2, the level the rule set is calibrated to", () => {
    expect(DEFAULT_STRICTNESS).toBe(2);
    expect(STRICTNESS_LEVELS).toEqual([1, 2, 3]);
  });

  it("recognizes its own levels and nothing else", () => {
    for (const n of STRICTNESS_LEVELS) expect(isStrictness(n)).toBe(true);
    for (const n of [0, 4, -1, 2.5, "2", null, undefined]) expect(isStrictness(n)).toBe(false);
  });
});

describe("floorAt", () => {
  it("doubles a floor at 1, leaves it at 2, and removes it at 3", () => {
    expect(floorAt(4, 1)).toBe(8);
    expect(floorAt(4, 2)).toBe(4);
    expect(floorAt(4, 3)).toBe(0);
  });

  it("rounds up, so a halved-then-doubled floor never lands between integers", () => {
    expect(floorAt(3, 1)).toBe(6);
    expect(Number.isInteger(floorAt(7, 1))).toBe(true);
  });

  it("makes a >= comparison vacuous at level 3, which is the point", () => {
    expect(1 >= floorAt(4, 3)).toBe(true);
  });

  it("moves a rate the same way, without rounding it to an integer", () => {
    expect(rateAt(6, 1)).toBe(12);
    expect(rateAt(6, 2)).toBe(6);
    expect(rateAt(6, 3)).toBe(0);
  });
});

describe("severityAt", () => {
  it("eases one step at 1 and raises one at 3", () => {
    expect(severityAt("low", 1)).toBe("candidate");
    expect(severityAt("low", 2)).toBe("low");
    expect(severityAt("low", 3)).toBe("medium");
  });

  it("clamps at both ends of the ladder", () => {
    expect(severityAt("candidate", 1)).toBe("candidate");
    expect(severityAt("high", 3)).toBe("high");
  });

  it("walks the same ladder the scorer weights", () => {
    expect([...SEVERITY_LADDER]).toEqual(Object.keys(SEVERITY_WEIGHT));
    // ...and in increasing weight order, which is what makes "one step up" mean "counts for more".
    const weights = SEVERITY_LADDER.map((s) => SEVERITY_WEIGHT[s]);
    expect(weights).toEqual([...weights].sort((a, b) => a - b));
  });

  it("leaves an unknown severity alone rather than guessing", () => {
    expect(shiftSeverity("nonsense" as never, 1)).toBe("nonsense");
  });
});

describe("the engine passes the dial down", () => {
  const recorder: { seen: unknown[] } = { seen: [] };
  const spy: TropeRule = {
    id: "test/spy",
    name: "records the strictness it was handed",
    tier: "lexical",
    detect(_doc: DocAnalysis, strictness): Finding[] {
      recorder.seen.push(strictness);
      return [];
    },
  };

  it("hands every rule the level it was given", () => {
    recorder.seen = [];
    runRules([spy], makeDoc("some words here"), 3);
    expect(recorder.seen).toEqual([3]);
  });

  it("hands down the default when the caller names no level", () => {
    recorder.seen = [];
    runRules([spy], makeDoc("some words here"));
    expect(recorder.seen).toEqual([DEFAULT_STRICTNESS]);
  });

  it("leaves a rule that ignores the parameter identical at every level", () => {
    const blind: TropeRule = {
      id: "test/blind",
      name: "reads no strictness",
      tier: "lexical",
      detect: (doc) => [
        { ruleId: "test/blind", span: { start: 0, end: 4 }, severity: "low", message: doc.text.slice(0, 4), explanation: "" },
      ],
    };
    const at = (s: 1 | 2 | 3) => JSON.stringify(runRules([blind], makeDoc("word word"), s).findings);
    expect(at(1)).toBe(at(2));
    expect(at(2)).toBe(at(3));
  });
});

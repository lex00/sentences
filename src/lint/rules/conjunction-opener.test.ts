import { describe, it, expect } from "vitest";
import { runRules } from "../engine.js";
import { buildDocAnalysis } from "../build-doc.js";
import { conjunctionOpenerRule } from "./conjunction-opener.js";
import type { Strictness } from "../strictness.js";

const run = (t: string, s?: Strictness) => runRules([conjunctionOpenerRule], buildDocAnalysis(t), s).findings;

// A document of `total` sentences, `openers` of which begin on a bare conjunction.
const body = (openers: number, total = 16): string => {
  const plain = [
    "The parser reads the input and resolves every name.",
    "The layout engine draws what comes back.",
    "The export path writes an SVG.",
    "The rule engine runs every rule.",
    "The report is versioned.",
    "The scorer weights each finding.",
    "The fixer deletes only the author's words.",
    "The loop re-lints after every step.",
    "The app renders a diagram.",
    "The CLI reads one file.",
    "The server speaks over stdio.",
    "The tests cover every rule.",
    "The battery checks each fixture.",
    "The docs explain the tiers.",
    "The weights are a build artifact.",
    "The licence is MIT.",
  ];
  const out: string[] = [];
  for (let i = 0; i < total; i++) out.push(plain[i % plain.length]!.replace("The ", `The ${i} `));
  for (let i = 0; i < openers; i++) out[i] = `And ${out[i]!.charAt(0).toLowerCase()}${out[i]!.slice(1)}`;
  return out.join(" ");
};

describe("discourse/conjunction-opener", () => {
  it("fires when the rate clears the floor, reporting each offending sentence", () => {
    const f = run(body(4)); // 4 of 16 = 25%
    expect(f).toHaveLength(4);
    expect(f[0]!.message).toContain("4 of 16 sentences");
  });

  it("stays silent on a document with none", () => {
    expect(run(body(0))).toEqual([]);
  });

  // The threshold is the whole rule: 3% is above the maximum measured in any hand-written document
  // in this repository, so a document at the human rate has to come back clean.
  it("stays silent at the human rate", () => {
    expect(run(body(0))).toEqual([]);
    const oneIn16 = run(body(1)); // 6.25% but only one opener
    expect(oneIn16).toEqual([]); // under the absolute floor of three
  });

  it("needs three openers, not just a high percentage", () => {
    expect(run("The parser reads it. And the layout draws it.")).toEqual([]);
  });

  it("needs enough sentences for a rate to mean anything", () => {
    expect(run("And one. And two. And three.")).toEqual([]);
  });

  // Two bands: at the floor it is a low-weight note, and at twice the floor the rhythm belongs to
  // the document rather than to a stretch of it.
  it("reports low near the floor and medium once the rate doubles", () => {
    expect(run(body(3, 60))[0]!.severity).toBe("low"); // 5%
    expect(run(body(6, 16))[0]!.severity).toBe("medium"); // 37.5%
  });

  it("stays out of bullets and headings", () => {
    const bullets = Array.from({ length: 16 }, (_, i) => `- And item number ${i}`).join("\n");
    expect(run(bullets)).toEqual([]);
  });

  it("at strictness 3 the length gate stands down", () => {
    const tiny = "And one thing. And another thing. And a third thing.";
    expect(run(tiny, 2)).toEqual([]);
    expect(run(tiny, 3).length).toBeGreaterThan(0);
  });
});

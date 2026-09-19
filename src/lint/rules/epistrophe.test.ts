import { describe, it, expect } from "vitest";
import { runRules } from "../engine.js";
import { buildDocAnalysis } from "../build-doc.js";
import { epistropheRule } from "./epistrophe.js";
import type { Strictness } from "../strictness.js";

const run = (text: string, s?: Strictness) => runRules([epistropheRule], buildDocAnalysis(text), s).findings;

const RUN =
  "But the reason is gone. The regulatory requirement that created the rule is gone. " +
  "The payment processor constraint that made the ugly version necessary is gone.";

describe("discourse/epistrophe", () => {
  it("fires on three sentences landing on the same two words", () => {
    const f = run(RUN);
    expect(f).toHaveLength(1);
    expect(f[0]!.message).toContain("end on “is gone”");
    expect(f[0]!.message).toContain("3 sentences");
  });

  it("reports one finding for the run, not one per sentence", () => {
    expect(run(`${RUN} And the rationale is gone.`)).toHaveLength(1);
  });

  it("spans the whole run", () => {
    const f = run(RUN);
    const sliced = RUN.slice(f[0]!.span.start, f[0]!.span.end);
    expect(sliced.startsWith("But the reason")).toBe(true);
    expect(sliced.endsWith("is gone")).toBe(true); // unit spans exclude the terminator
  });

  it("escalates past three", () => {
    expect(run(RUN)[0]!.severity).toBe("medium");
    expect(run(`${RUN} And the rationale is gone.`)[0]!.severity).toBe("high");
  });

  // --- what it refuses ---------------------------------------------------------------------

  it("stays silent on three different endings", () => {
    expect(run("But the reason is gone. The requirement still stands. The constraint was written down.")).toEqual([]);
  });

  it("stays silent on a pair, which is not yet a run", () => {
    expect(run("The reason is gone. The requirement is gone.")).toEqual([]);
  });

  // A sentence that IS its own ending is a repeated SENTENCE, which rules/repetition.ts owns.
  // Epistrophe needs different sentences arriving at the same close.
  it("stays silent when the whole sentence is the ending", () => {
    expect(run("It is. It is. It is.")).toEqual([]);
  });

  it("stays out of bullets and headings", () => {
    expect(run("- the reason is gone\n- the rule is gone\n- the constraint is gone")).toEqual([]);
  });

  it("needs the run to be consecutive, not merely nearby", () => {
    const spread = "The reason is gone. One. Two. Three. Four. Five. The rule is gone. Six. Seven. Eight. Nine. The constraint is gone.";
    expect(run(spread)).toEqual([]);
  });

  // --- the dial -----------------------------------------------------------------------------

  it("at strictness 3 a pair is enough", () => {
    const pair = "The reason is gone. The requirement is gone.";
    expect(run(pair, 2)).toEqual([]);
    expect(run(pair, 3)).toHaveLength(1);
  });

  it("at strictness 1 the floor doubles and a three-run goes quiet", () => {
    expect(run(RUN, 2)).toHaveLength(1);
    expect(run(RUN, 1)).toEqual([]);
  });
});

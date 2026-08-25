import { describe, it, expect } from "vitest";
import { runRules } from "../engine.js";
import { makeDoc, spanOf } from "../stub-doc.js";
import { elegantVariationRule } from "./elegant-variation.js";

const run = (text: string) => runRules([elegantVariationRule], makeDoc(text)).findings;

const CAR_CYCLE =
  "The vehicle arrived late that morning. This automobile had been repainted twice. Said car was finally towed away.";

describe("claude/elegant-variation", () => {
  it("fires on three names for one referent, spanning first phrase to last", () => {
    const findings = run(CAR_CYCLE);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.ruleId).toBe("claude/elegant-variation");
    expect(findings[0]!.span).toEqual(
      spanOf(CAR_CYCLE, "The vehicle arrived late that morning. This automobile had been repainted twice. Said car"),
    );
    expect(findings[0]!.severity).toBe("low");
    expect(findings[0]!.message).toContain("“vehicle”");
    expect(findings[0]!.message).toContain("“car”");
  });

  it("bumps to medium when two different clusters cycle in one document", () => {
    const text = `${CAR_CYCLE} The report landed on Tuesday. This document ran to sixty pages. The paper was never read.`;
    const findings = run(text);
    expect(findings).toHaveLength(2);
    expect(findings.map((f) => f.severity)).toEqual(["medium", "medium"]);
    expect(findings[0]!.explanation).toContain("Two different things");
  });

  it("stays silent on the same noun repeated — that is repetition, not variation", () => {
    expect(run("The car arrived late that morning. A mechanic towed the car away. Nobody claimed the car afterwards.")).toEqual([]);
  });

  it("stays silent on only two synonyms", () => {
    expect(run("The vehicle arrived late that morning. This automobile had been repainted twice.")).toEqual([]);
  });

  it("stays silent on determinerless generic mentions", () => {
    expect(run("Cars are expensive to insure. Vehicles depreciate quickly. Automobiles lose value fast.")).toEqual([]);
  });

  it("stays silent when the synonyms are too far apart to be a cycle", () => {
    const filler = "Nothing much happened in between here at all. ";
    const text = `The vehicle arrived late. ${filler}${filler}${filler}${filler}This automobile had been repainted. ${filler}Said car was towed.`;
    expect(run(text)).toEqual([]);
  });

  // The exactly-once test is per WINDOW, not per document: a name coming back later doesn't excuse
  // the stretch where three of them cycled. The window starting at "automobile" has each of
  // automobile/car/vehicle exactly once, so the cycle still reports — from that window's start.
  it("still fires when one of the three names comes back later", () => {
    const text = "The vehicle arrived late. This automobile was repainted. Said car was towed. The vehicle never came back.";
    const findings = run(text);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.span).toEqual(
      spanOf(text, "This automobile was repainted. Said car was towed. The vehicle"),
    );
  });

  it("reads through an adjective between the determiner and the noun", () => {
    const text = "The battered vehicle arrived late. This freshly repainted automobile stalled twice. Said car was towed.";
    expect(run(text)).toHaveLength(1);
  });

  it("counts a plural surface form against its singular cluster entry", () => {
    const text = "The vehicles arrived late. This automobile had been repainted. Said car was towed away.";
    expect(run(text)).toHaveLength(1);
  });

  it("reports one cycle per cluster run, not one per overlapping window", () => {
    const text =
      "The vehicle arrived late. This automobile was repainted. Said car was towed. That motorcar never returned.";
    expect(run(text)).toHaveLength(1);
  });

  it("is deterministic", () => {
    expect(JSON.stringify(run(CAR_CYCLE))).toBe(JSON.stringify(run(CAR_CYCLE)));
  });
});

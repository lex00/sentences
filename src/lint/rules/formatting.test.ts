import { describe, it, expect } from "vitest";
import { makeDoc } from "../stub-doc.js";
import { textAt } from "../span.js";
import {
  emDashDensityRule,
  unicodeDecorationRule,
  boldFirstBulletRule,
  listicleInTrenchCoatRule,
} from "./formatting.js";

describe("formatting/em-dash-density", () => {
  it("stays quiet for a single em dash — normal punctuation, not a pattern", () => {
    const text = "This sentence has one dash — right there, and nothing else remarkable at all here today.";
    expect(emDashDensityRule.detect(makeDoc(text))).toEqual([]);
  });

  it("fires low/medium/high as density climbs, one finding per occurrence sharing the aggregate severity", () => {
    // 20 words, 2 dashes -> 100/1000, well over the high threshold, but count-gated fixtures below
    // exercise the boundary more directly with a longer filler passage.
    const filler = Array(200).fill("word").join(" "); // 200 words, no dashes
    const twoDash = `${filler} one — two -- three`; // 2 dashes over ~203 words => ~9.85/1000 (high)
    const findings = emDashDensityRule.detect(makeDoc(twoDash));
    expect(findings).toHaveLength(2);
    expect(findings.every((f) => f.severity === "high")).toBe(true);
    expect(findings[0]!.message).toMatch(/2 in ~\d+ words/);
  });

  it("ignores dashes inside a fenced code block", () => {
    const text = ["prose — one", "```", "a -- b -- c -- d -- e", "```", "more prose — two"].join("\n");
    // Only the two prose dashes count; density over the small word count still clears the low bar.
    const findings = emDashDensityRule.detect(makeDoc(text));
    expect(findings).toHaveLength(2);
    for (const f of findings) {
      expect(textAt(text, f.span)).toMatch(/—/);
    }
  });
});

describe("formatting/unicode-decoration", () => {
  it("stays quiet on plain ASCII arrows and straight quotes", () => {
    const text = 'Input -> processing -> output. "Quoted" and don\'t worry about it.';
    expect(unicodeDecorationRule.detect(makeDoc(text))).toEqual([]);
  });

  it("flags unicode arrows once for the whole document with a count", () => {
    const text = "Input → processing ⇒ output.";
    const findings = unicodeDecorationRule.detect(makeDoc(text));
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toContain("2 unicode arrow");
  });

  it("flags curly quotation marks but not a curly apostrophe used as a contraction", () => {
    const text = "She said “hello” and it’s fine, don’t worry.";
    const findings = unicodeDecorationRule.detect(makeDoc(text));
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toContain("smart quotes");
    // “hello” = 2 curly double quotes; the two ’ in it's/don't sit between letters and are skipped.
    expect(findings[0]!.message).toContain("2 curly quotation mark");
  });

  it("flags a standalone curly single quote used as a quotation mark", () => {
    const text = "He called it ‘progress’ without asking anyone.";
    const findings = unicodeDecorationRule.detect(makeDoc(text));
    expect(findings.some((f) => f.message.includes("curly quotation mark"))).toBe(true);
  });

  it("flags decorative symbols and can report multiple categories at once", () => {
    const text = "Great work! ✨ Now go → build it.";
    const findings = unicodeDecorationRule.detect(makeDoc(text));
    const messages = findings.map((f) => f.message);
    expect(messages.some((m) => m.includes("decorative symbol"))).toBe(true);
    expect(messages.some((m) => m.includes("unicode arrow"))).toBe(true);
  });

  it("ignores unicode decoration inside a fenced code block", () => {
    const text = ["```", "const arrow = () => {}; // uses “fat arrow”, not our target", "```"].join("\n");
    expect(unicodeDecorationRule.detect(makeDoc(text))).toEqual([]);
  });
});

describe("formatting/bold-first-bullet", () => {
  it("a README with one bold lead-in stays clean", () => {
    const text = [
      "- **Security**: environment-based configuration",
      "- Handles retries automatically",
      "- Ships with sane defaults out of the box",
    ].join("\n");
    expect(boldFirstBulletRule.detect(makeDoc(text))).toEqual([]);
  });

  it("a fully bold-first list fires once with the list's span", () => {
    const text = [
      "- **Security**: environment-based configuration",
      "- **Performance**: lazy loading of expensive resources",
      "- **Reliability**: automatic retries with backoff",
    ].join("\n");
    const findings = boldFirstBulletRule.detect(makeDoc(text));
    expect(findings).toHaveLength(1);
    expect(textAt(text, findings[0]!.span)).toBe(text);
    expect(findings[0]!.message).toContain("3/3");
  });

  it("does not fire on a list with fewer than 3 items", () => {
    const text = ["- **One**: first", "- **Two**: second"].join("\n");
    expect(boldFirstBulletRule.detect(makeDoc(text))).toEqual([]);
  });

  it("fires when the fraction clears 60% even if not every item is bold", () => {
    const text = [
      "- **One**: first thing",
      "- **Two**: second thing",
      "- **Three**: third thing",
      "- and a plain fourth item",
    ].join("\n");
    const findings = boldFirstBulletRule.detect(makeDoc(text));
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toContain("3/4");
  });
});

describe("formatting/listicle-in-trench-coat", () => {
  it("stays quiet under three consecutive ordinal paragraphs", () => {
    const text = [
      "The first wall is the absence of a free API.",
      "",
      "The second wall is the lack of delegated access.",
      "",
      "Something else entirely follows here.",
    ].join("\n");
    expect(listicleInTrenchCoatRule.detect(makeDoc(text))).toEqual([]);
  });

  it("fires once for three or more consecutive ordinal-opening paragraphs", () => {
    const text = [
      "The first wall is the absence of a free, scoped API for this exact case.",
      "",
      "The second wall is the lack of delegated access across teams.",
      "",
      "The third wall is the absence of scoped permissions entirely.",
    ].join("\n");
    const findings = listicleInTrenchCoatRule.detect(makeDoc(text));
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe("medium");
    expect(textAt(text, findings[0]!.span)).toBe(text);
  });

  it("is case-insensitive and recognizes next/final as ordinals, escalating severity at 4+", () => {
    const text = [
      "First, we need to define the problem clearly for readers.",
      "",
      "Next, we gather the evidence needed to support any claim.",
      "",
      "Third, we weigh the evidence against the counterarguments raised.",
      "",
      "Last, we reach a conclusion grounded in the evidence above.",
    ].join("\n");
    const findings = listicleInTrenchCoatRule.detect(makeDoc(text));
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe("high");
  });

  it("a run interrupted by a non-ordinal paragraph does not merge into one finding", () => {
    const text = [
      "The first point stands on its own here today.",
      "",
      "Meanwhile something unrelated happens in between paragraphs.",
      "",
      "The second point follows after the interruption above.",
      "",
      "The third point closes out the discussion nicely.",
    ].join("\n");
    // Only the last two form a consecutive run of ordinal-opening paragraphs (< 3), so nothing fires.
    expect(listicleInTrenchCoatRule.detect(makeDoc(text))).toEqual([]);
  });
});

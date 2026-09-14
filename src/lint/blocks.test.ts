import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { blockSpans, splitByBlock } from "./blocks.js";
import { makeDoc } from "./stub-doc.js";
import { buildDocAnalysis } from "./build-doc.js";
import { extractProse } from "./markdown-prose.js";
import type { Span } from "./types.js";

const blocks = (text: string): string[] => blockSpans(text).map((b) => text.slice(b.start, b.end));

describe("blockSpans", () => {
  it("gives a heading its own block", () => {
    expect(blocks("## Status\nThe next line is prose.")).toEqual(["## Status", "The next line is prose."]);
  });

  it("keeps hard-wrapped prose in one block", () => {
    const wrapped = "The rewrite shipped in March, a full\nrelease behind the roadmap we published.";
    expect(blocks(wrapped)).toEqual([wrapped]);
  });

  it("splits paragraphs at a blank line", () => {
    expect(blocks("First para.\n\nSecond para.")).toEqual(["First para.", "Second para."]);
  });

  it("gives each bullet its own block but keeps a wrapped continuation with it", () => {
    expect(blocks("- First item\n  wrapped on", )).toEqual(["- First item\n  wrapped on"]);
    expect(blocks("- One\n- Two")).toEqual(["- One", "- Two"]);
  });

  it("gives a fenced block its own block, separate from the prose around it", () => {
    expect(blocks("Before.\n```js\nconst x = 1;\n```\nAfter.")).toEqual([
      "Before.",
      "```js\nconst x = 1;\n```",
      "After.",
    ]);
  });

  it("separates a blockquote from the prose under it", () => {
    expect(blocks("> Quoted line\nOrdinary prose.")).toEqual(["> Quoted line", "Ordinary prose."]);
  });

  it("returns nothing for an empty or blank document", () => {
    expect(blockSpans("")).toEqual([]);
    expect(blockSpans("\n\n   \n")).toEqual([]);
  });
});

describe("splitByBlock", () => {
  it("puts the sub-splitter's offsets back into document coordinates", () => {
    const text = "## Head\nOne. Two.";
    // A splitter that returns the whole block, so the spans it yields are easy to check.
    const whole = (s: string): Span[] => [{ start: 0, end: s.length }];
    expect(splitByBlock(text, whole).map((sp) => text.slice(sp.start, sp.end))).toEqual(["## Head", "One. Two."]);
  });
});

// --- the invariant that would have caught the divergence ---------------------------------------
//
// The two document builders disagreed for months and nothing could see it: fixtures run through
// makeDoc, production runs through buildDocAnalysis, and no test ever compared them. makeDoc broke
// on every newline (shredding hard-wrapped prose); buildDocAnalysis broke on `. ! ? ; :` alone
// (fusing a heading with the paragraph under it). Each was wrong in the direction the other was
// right, and the fixture battery is structurally blind to the difference.
//
// This is the property that pins them. It does not require the two to agree unit-for-unit — they
// legitimately differ on whether a terminator belongs to the unit it ends — only that NEITHER ever
// produces a unit straddling a block boundary, which is the bug class itself.
describe("no unit crosses a block boundary", () => {
  const CASES: Record<string, string> = {
    "heading then paragraph": "## Status\n\n- Automatic parse, in-browser\n\nThe next paragraph lands here, with a tail.",
    "heading with no blank line": "## Status\nThe paragraph directly under it.",
    "hard-wrapped paragraph": "The rewrite shipped in March, a full\nrelease behind the roadmap we had published.",
    "bullets without terminators": "- One thing\n- Another thing\n- A third",
    "fence between paragraphs": "Before the fence.\n```js\nconst x = 1;\n```\nAfter the fence.",
    "blockquote then prose": "> Someone else said this\nAnd then we replied.",
    "everything at once": "# Title\n\nA paragraph that wraps\nacross two lines.\n\n- A bullet\n- Another\n\n> A quote\n\nThe end.",
  };

  const crossings = (text: string, spans: readonly Span[]): string[] => {
    const bounds = blockSpans(text);
    return spans
      .filter((u) => !bounds.some((b) => u.start >= b.start && u.end <= b.end))
      .map((u) => JSON.stringify(text.slice(u.start, u.end)));
  };

  for (const [name, text] of Object.entries(CASES)) {
    it(`makeDoc keeps every unit inside one block — ${name}`, () => {
      expect(crossings(text, makeDoc(text).units.map((u) => u.span))).toEqual([]);
    });

    it(`buildDocAnalysis keeps every unit inside one block — ${name}`, () => {
      expect(crossings(text, buildDocAnalysis(text).units.map((u) => u.span))).toEqual([]);
    });
  }

  // The regression in its original form: three blocks that fused into one unit because none of
  // them ended in punctuation.
  it("no longer fuses a heading, a bullet and a paragraph into one unit", () => {
    const text = CASES["heading then paragraph"]!;
    expect(buildDocAnalysis(text).units.length).toBeGreaterThan(1);
    expect(makeDoc(text).units.length).toBeGreaterThan(1);
  });

  // And the same invariant over real documents, where the shapes are not ones a test author
  // thought to write down.
  for (const file of ["README.md", "docs/DESTINK.md", "docs/EDU-GAME.md"]) {
    it(`holds across ${file}`, () => {
      const prose = extractProse(readFileSync(file, "utf8"));
      expect(crossings(prose, buildDocAnalysis(prose).units.map((u) => u.span))).toEqual([]);
      expect(crossings(prose, makeDoc(prose).units.map((u) => u.span))).toEqual([]);
    });
  }
});

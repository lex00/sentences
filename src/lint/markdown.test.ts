import { describe, it, expect } from "vitest";
import { markdownContext, kindAt, inKind } from "./markdown.js";

describe("markdownContext — line classification", () => {
  it("classifies headings, blockquotes, bullets and prose", () => {
    const text = ["# Title", "", "> a quote", "", "- one", "- two", "", "Just prose."].join("\n");
    const ctx = markdownContext(text);
    expect(ctx.lines.map((l) => l.kind)).toEqual(["heading", "blockquote", "bullet", "bullet", "prose"]);
  });

  it("reads ATX heading level from the # run", () => {
    const ctx = markdownContext("### Three");
    expect(ctx.lines[0]).toMatchObject({ kind: "heading", level: 3 });
  });

  it("does not treat a heading marker inside a blockquote as a heading", () => {
    const ctx = markdownContext("> # not a heading");
    expect(ctx.lines[0]!.kind).toBe("blockquote");
  });

  it("recognizes -, *, + and numbered bullets, and slices marker/content separately", () => {
    const text = "- dash\n* star\n+ plus\n1. one\n2) two";
    const ctx = markdownContext(text);
    expect(ctx.lines.map((l) => l.kind)).toEqual(["bullet", "bullet", "bullet", "bullet", "bullet"]);
    const first = ctx.lines[0] as Extract<(typeof ctx.lines)[number], { kind: "bullet" }>;
    expect(text.slice(first.markerSpan.start, first.markerSpan.end)).toBe("-");
    expect(text.slice(first.contentSpan.start, first.contentSpan.end)).toBe("dash");
    expect(first.ordered).toBe(false);
    const numbered = ctx.lines[3] as Extract<(typeof ctx.lines)[number], { kind: "bullet" }>;
    expect(numbered.ordered).toBe(true);
    expect(text.slice(numbered.contentSpan.start, numbered.contentSpan.end)).toBe("one");
  });

  it("recognizes glyph bullet markers, unordered, with marker/content sliced the same way", () => {
    const text = "\u2022 bullet\n\u25AA square\n\u2192 arrow\n\u21D2 double";
    const ctx = markdownContext(text);
    expect(ctx.lines.map((l) => l.kind)).toEqual(["bullet", "bullet", "bullet", "bullet"]);
    const arrow = ctx.lines[2] as Extract<(typeof ctx.lines)[number], { kind: "bullet" }>;
    expect(text.slice(arrow.markerSpan.start, arrow.markerSpan.end)).toBe("\u2192");
    expect(text.slice(arrow.contentSpan.start, arrow.contentSpan.end)).toBe("arrow");
    expect(arrow.ordered).toBe(false);
  });

  it("keeps a glyph list OUT of the paragraph grouping instead of folding it into one paragraph", () => {
    // The regression this was added for: eight arrow-marked lines used to classify as prose and
    // group into a single 8-line "paragraph", which silently skewed every rule that counts
    // sentences per paragraph (rules/staccato-register.ts) and hid the list from
    // bold-first-bullet and listicle-in-trench-coat entirely.
    const ctx = markdownContext("Intro line.\n\n\u2192 one\n\u2192 two\n\u2192 three\n\nOutro line.");
    expect(ctx.paragraphs).toHaveLength(2);
    expect(ctx.lists).toHaveLength(1);
    expect(ctx.lists[0]!.items).toHaveLength(3);
  });

  it("does not treat a glyph mid-line, or one with no space after it, as a marker", () => {
    const ctx = markdownContext("Capability \u2260 Authority.\n\u2192nospace\nplain \u2022 dot");
    expect(ctx.lines.map((l) => l.kind)).toEqual(["prose", "prose", "prose"]);
  });

  it("does not classify blank lines", () => {
    const ctx = markdownContext("prose one\n\n\nprose two");
    expect(ctx.lines).toHaveLength(2);
    expect(ctx.lines.every((l) => l.kind === "prose")).toBe(true);
  });
});

describe("markdownContext — code fences", () => {
  it("marks every line inside ``` fences as codeFence, delimiters included", () => {
    const text = ["prose before", "```js", "const x = 1; // — not a real em dash trope", "```", "prose after"].join("\n");
    const ctx = markdownContext(text);
    expect(ctx.lines.map((l) => l.kind)).toEqual(["prose", "codeFence", "codeFence", "codeFence", "prose"]);
    expect(ctx.codeFences).toHaveLength(1);
    expect(text.slice(ctx.codeFences[0]!.start, ctx.codeFences[0]!.end)).toBe("```js\nconst x = 1; // — not a real em dash trope\n```");
  });

  it("supports ~~~ fences and requires a matching or longer closer", () => {
    const text = "~~~~\ncode\n~~~~\nprose";
    const ctx = markdownContext(text);
    expect(ctx.lines.map((l) => l.kind)).toEqual(["codeFence", "codeFence", "codeFence", "prose"]);
  });

  it("a shorter closer does not close the fence", () => {
    const text = ["````", "``` (not a close, too short)", "````"].join("\n");
    const ctx = markdownContext(text);
    expect(ctx.lines.map((l) => l.kind)).toEqual(["codeFence", "codeFence", "codeFence"]);
  });

  it("runs an unterminated fence to end of document", () => {
    const ctx = markdownContext("```\nunterminated\nstill code");
    expect(ctx.lines.map((l) => l.kind)).toEqual(["codeFence", "codeFence", "codeFence"]);
    expect(ctx.codeFences).toHaveLength(1);
  });
});

describe("markdownContext — lists and paragraphs", () => {
  it("groups consecutive bullet lines into one list block", () => {
    const text = "- a\n- b\n- c";
    const ctx = markdownContext(text);
    expect(ctx.lists).toHaveLength(1);
    expect(ctx.lists[0]!.items).toHaveLength(3);
    expect(text.slice(ctx.lists[0]!.span.start, ctx.lists[0]!.span.end)).toBe(text);
  });

  it("splits into two lists when a blank line interrupts (documented tight-list-only behavior)", () => {
    const text = "- a\n- b\n\n- c";
    const ctx = markdownContext(text);
    expect(ctx.lists).toHaveLength(2);
    expect(ctx.lists[0]!.items).toHaveLength(2);
    expect(ctx.lists[1]!.items).toHaveLength(1);
  });

  it("groups consecutive prose lines into one paragraph, split by blank lines", () => {
    const text = "line one\nline two\n\nline three";
    const ctx = markdownContext(text);
    expect(ctx.paragraphs).toHaveLength(2);
    expect(text.slice(ctx.paragraphs[0]!.span.start, ctx.paragraphs[0]!.span.end)).toBe("line one\nline two");
    expect(text.slice(ctx.paragraphs[1]!.span.start, ctx.paragraphs[1]!.span.end)).toBe("line three");
  });

  it("does not merge a paragraph across a heading or bullet", () => {
    const text = "prose\n# heading\nmore prose";
    const ctx = markdownContext(text);
    expect(ctx.paragraphs).toHaveLength(2);
  });
});

describe("kindAt / inKind", () => {
  const text = "# Heading\n\nSome prose here.\n\n```\ncode\n```";
  const ctx = markdownContext(text);

  it("kindAt resolves the kind of the line at an offset", () => {
    expect(kindAt(ctx, 2)).toBe("heading");
    expect(kindAt(ctx, text.indexOf("prose"))).toBe("prose");
    expect(kindAt(ctx, text.indexOf("code"))).toBe("codeFence");
  });

  it("kindAt returns undefined for a blank line", () => {
    expect(kindAt(ctx, text.indexOf("\n\n") + 1)).toBeUndefined();
  });

  it("inKind is true only when the whole span sits inside one matching line", () => {
    const codeSpan = { start: text.indexOf("code"), end: text.indexOf("code") + 4 };
    expect(inKind(ctx, codeSpan, "codeFence")).toBe(true);
    expect(inKind(ctx, codeSpan, "prose")).toBe(false);

    const proseSpan = { start: text.indexOf("Some"), end: text.indexOf("Some") + 4 };
    expect(inKind(ctx, proseSpan, "prose")).toBe(true);
  });

  it("inKind is false for a span that straddles a blank line", () => {
    const straddle = { start: text.indexOf("Heading") - 3, end: text.indexOf("Some") + 4 };
    expect(inKind(ctx, straddle, "heading")).toBe(false);
    expect(inKind(ctx, straddle, "prose")).toBe(false);
  });
});

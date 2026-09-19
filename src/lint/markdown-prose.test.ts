import { describe, it, expect } from "vitest";
import { extractProse, frontmatterSpan } from "./markdown-prose.js";

// Every assertion here checks one of two things: that a construct is gone, or that offsets still
// index the original. The second is the property the whole module exists to keep.
const kept = (src: string, needle: string) => extractProse(src).includes(needle);

describe("extractProse — offsets", () => {
  it("returns a string of the same length, so a span still indexes the source", () => {
    const src = "Read the [guide](guides/operate/deploy.md) first.\n\n| a | b |\n";
    const out = extractProse(src);
    expect(out).toHaveLength(src.length);
  });

  it("keeps newlines, so line numbers and paragraph grouping survive", () => {
    const src = "one\n\n```js\ncode\n```\n\ntwo\n";
    const out = extractProse(src);
    expect(out.split("\n")).toHaveLength(src.split("\n").length);
    expect(out.split("\n")[3]).toBe("    "); // the code line, blanked but still a line
  });

  it("blanks to spaces rather than deleting, so a span slices the real text back out", () => {
    const src = "The `--config` flag matters.";
    const out = extractProse(src);
    const idx = out.indexOf("flag");
    expect(src.slice(idx, idx + 4)).toBe("flag");
  });
});

describe("extractProse — what it removes", () => {
  it("removes fenced code, including a fence indented inside a list item", () => {
    const src = ["1. Do this:", "", "    ```js", "    const x = a -- b;", "    ```", "", "Then stop."].join("\n");
    expect(kept(src, "const x")).toBe(false);
    expect(kept(src, "Then stop.")).toBe(true);
  });

  it("removes table rows, which are fragments rather than sentences", () => {
    const src = "Intro.\n\n| Provider | Key |\n|---|---|\n| E2B | `E2B_API_KEY` |\n\nOutro.";
    expect(kept(src, "Provider")).toBe(false);
    expect(kept(src, "Intro.")).toBe(true);
    expect(kept(src, "Outro.")).toBe(true);
  });

  it("removes inline code, so `--config` is not counted as an em dash", () => {
    const src = "Run `mix sobelow --config` before pushing.";
    expect(kept(src, "--config")).toBe(false);
    expect(kept(src, "before pushing")).toBe(true);
  });

  it("removes a link's target but keeps its text", () => {
    const src = "Start with [Deploy an instance](guides/operate/deploy.md).";
    expect(kept(src, "Deploy an instance")).toBe(true);
    expect(kept(src, "guides")).toBe(false);
    expect(kept(src, "operate")).toBe(false);
  });

  it("removes a list item that is nothing but a link, and keeps one that is a sentence", () => {
    const src = "- [Configure email](guides/operate/email.md)\n- The mail provider must be reachable.";
    expect(kept(src, "Configure email")).toBe(false);
    expect(kept(src, "The mail provider must be reachable.")).toBe(true);
  });

  it("removes an inlined HTML or SVG block", () => {
    const src = 'Before.\n\n<svg viewBox="0 0 10 10">\n  <text>→ GitHub</text>\n</svg>\n\nAfter.';
    expect(kept(src, "GitHub")).toBe(false);
    expect(kept(src, "Before.")).toBe(true);
    expect(kept(src, "After.")).toBe(true);
  });

  it("removes an admonition directive line but keeps its body", () => {
    const src = '!!! tip "In a hurry?"\n    Install the CLI and log in.';
    expect(kept(src, "In a hurry?")).toBe(false);
    expect(kept(src, "Install the CLI and log in.")).toBe(true);
  });

  it("removes bare URLs and reference-style link definitions", () => {
    const src = "See https://example.com/guides/operate for more.\n\n[ref]: https://example.com/x\n";
    expect(kept(src, "example.com")).toBe(false);
    expect(kept(src, "for more.")).toBe(true);
  });
});

describe("extractProse — what it keeps", () => {
  it("leaves ordinary prose, headings and bullet text alone", () => {
    const src = "# Title\n\nA sentence that says something.\n\n- A bullet that is a real clause.\n";
    const out = extractProse(src);
    expect(out).toContain("A sentence that says something.");
    expect(out).toContain("A bullet that is a real clause.");
    expect(out).toContain("# Title");
  });

  it("leaves a real em dash in prose, which is the finding the rule wants", () => {
    expect(kept("It was over — and everyone knew it.", "—")).toBe(true);
  });

  it("is idempotent", () => {
    const src = "Read the [guide](x.md).\n\n| a | b |\n\n`code`\n";
    expect(extractProse(extractProse(src))).toBe(extractProse(src));
  });
});

describe("frontmatter", () => {
  const FM = ["---", "title: Export a snapshot", "description: Freeze the estate.", "---", "", "The bundle is deploy ready."].join("\n");

  it("blanks a YAML block at the top of the file", () => {
    const out = extractProse(FM);
    expect(out).toHaveLength(FM.length);
    expect(out).not.toContain("title:");
    expect(out).not.toContain("---");
    expect(out).toContain("The bundle is deploy ready.");
  });

  it("blanks a TOML block too, which Hugo uses", () => {
    const toml = ["+++", 'title = "Export"', "+++", "", "The bundle is ready."].join("\n");
    const out = extractProse(toml);
    expect(out).not.toContain("+++");
    expect(out).toContain("The bundle is ready.");
  });

  it("keeps newlines, so line numbers still count", () => {
    const out = extractProse(FM);
    expect(out.split("\n")).toHaveLength(FM.split("\n").length);
  });

  it("reports the span, which starts at 0 and excludes the trailing newline", () => {
    expect(frontmatterSpan(FM)).toEqual({ start: 0, end: FM.indexOf("---", 3) + 3 });
  });

  // Position is the only thing separating frontmatter from a horizontal rule, and every static
  // site generator resolves it the same way: only the first line can open a block.
  it("leaves a --- rule alone when it is not the first line", () => {
    const mid = "Some prose first.\n\n---\nnot: frontmatter\n---\n";
    expect(extractProse(mid)).toContain("not: frontmatter");
    expect(frontmatterSpan(mid)).toBeNull();
  });

  it("does not open a block on a --- with no closing delimiter", () => {
    expect(frontmatterSpan("---\ntitle: unterminated\n\nProse here.\n")).toBeNull();
  });

  it("handles an empty block", () => {
    expect(frontmatterSpan("---\n---\nProse.")).toEqual({ start: 0, end: 7 });
  });

  it("takes the FIRST closing delimiter, not the last", () => {
    const two = ["---", "title: One", "---", "", "Prose.", "", "---", "", "More prose."].join("\n");
    const out = extractProse(two);
    expect(out).toContain("Prose.");
    expect(out).toContain("More prose.");
  });

  // The whole point of the issue: the keys lint as prose and the delimiters count as em dashes.
  it("leaves nothing for the rules to find in a title block", () => {
    expect(extractProse(FM).slice(0, FM.indexOf("The"))).toMatch(/^\s*$/);
  });
});

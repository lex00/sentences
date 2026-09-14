// Where a document stops being one stretch of prose.
//
// `splitUnits` (document.ts) breaks a document into sentences on `. ! ? ; :` and nothing else. That
// is the right rule INSIDE a paragraph and wrong between blocks, because most markdown blocks do
// not end in punctuation at all. A heading does not. A bullet usually does not. So:
//
//   "## Status\n\n- Automatic parse, in-browser\n\nThe next paragraph lands here, with a tail."
//
// came back as ONE unit — heading, bullet and paragraph fused — and because the fused span is not
// wholly inside any single block, `inKind(ctx, span, "heading")` answers false for all three. Every
// rule that suppresses headings, bullets, fences and quotes was relying on a test that silently
// stopped applying at exactly the place it mattered.
//
// THE OPPOSITE MISTAKE, which is why this module is not simply "break on \n". stub-doc.ts did break
// on every newline, and that shreds hard-wrapped prose — the way this repository's own docs are
// written:
//
//   "…shipped in March, a full\nrelease behind the roadmap…"   ->   two "sentences", one of them
//                                                                   starting mid-clause
//
// So the two document builders were each wrong, in opposite directions, and neither could see it:
// fixtures run through the stub and production runs through the other. Both now call this, which
// makes the agreement structural rather than a thing to remember.
//
// A BLOCK, then, is a run of lines a sentence is allowed to flow across. Blank lines end one. A
// heading is always alone. A fence is always alone. Each bullet starts a new one, because two
// adjacent bullets are two items — but a plain line directly under a bullet is that bullet's own
// wrapped continuation and stays with it, which is the case a naive kind-change test gets wrong.
//
// Found by an external consumer of this package, who hit the near side of it: sentence boundaries
// that ignore trailing markup merge a bold-led sentence into its neighbour. Same root, wider blast.

import { markdownContext } from "./markdown.js";
import type { MarkdownLine } from "./markdown.js";
import type { Span } from "./types.js";

// Does `line` begin a new block, given the line before it? `fence` / `prevFence` identify the
// fenced block each line sits in, or -1 for neither: a whole fence is ONE block, delimiters
// included, so its opening line, its body and its closing line do not come back as three.
function startsBlock(line: MarkdownLine, prev: MarkdownLine | null, fence: number, prevFence: number): boolean {
  if (!prev) return true;
  if (fence !== prevFence) return true; // entering, leaving, or crossing between fences
  if (fence >= 0) return false; // both inside the same fence
  if (line.lineIndex !== prev.lineIndex + 1) return true; // a blank line came between
  if (line.kind === "heading" || prev.kind === "heading") return true; // a heading stands alone
  if (line.kind === "bullet") return true; // a new marker is a new item
  if (line.kind === "prose" && prev.kind === "bullet") return false; // ...but a wrapped one is not
  return line.kind !== prev.kind;
}

// The document's blocks, in order, as spans into `text`. Blank lines fall between blocks and belong
// to none, so concatenating these does not reproduce the input — they are boundaries to split on,
// not a partition.
export function blockSpans(text: string): Span[] {
  const ctx = markdownContext(text);
  const fenceOf = (line: MarkdownLine): number =>
    ctx.codeFences.findIndex((f) => line.span.start >= f.start && line.span.end <= f.end);

  const blocks: Span[] = [];
  let prev: MarkdownLine | null = null;
  let prevFence = -1;
  for (const line of ctx.lines) {
    const fence = fenceOf(line);
    if (startsBlock(line, prev, fence, prevFence)) blocks.push({ start: line.span.start, end: line.span.end });
    else blocks[blocks.length - 1]!.end = line.span.end;
    prev = line;
    prevFence = fence;
  }
  return blocks;
}

// Run `split` over each block separately and put the results back in document coordinates.
//
// The offset shift is the whole reason this helper exists rather than each builder doing it: a
// splitter handed a slice reports offsets into that slice, and a finding located against the
// document has to index the document. Callers pass a splitter that works on a string and get spans
// that index `text`.
export function splitByBlock(text: string, split: (blockText: string) => Span[]): Span[] {
  const out: Span[] = [];
  for (const block of blockSpans(text)) {
    const slice = text.slice(block.start, block.end);
    for (const span of split(slice)) {
      out.push({ start: span.start + block.start, end: span.end + block.start });
    }
  }
  return out;
}

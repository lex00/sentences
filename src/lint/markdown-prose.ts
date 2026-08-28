// Markdown in, prose out, offsets preserved.
//
// The rules in this package lint PROSE. `splitUnits` (document.ts) breaks on `. ! ? ; :` and the
// rules read sentences, so markdown structure that is not prose gets read as if it were: a table
// row becomes a verbless fragment, a "Related" list of six links becomes six sentences with the
// same opening, and a path segment in a URL becomes a word the lexicons can match.
//
// The formatting rules already handle this one construct at a time, by asking
// `inKind(ctx, span, "codeFence")` before they count. That works for the tier that was written
// against markdown and not for the other three, which know nothing about it. This module is the
// other half: a single pass that removes everything that is not prose, so EVERY rule sees only
// prose without each one having to learn markdown.
//
// MEASURED, on an 88-page technical documentation corpus (Elixir/Phoenix product docs, ~53k
// words). Run over the raw markdown the full rule set reported 2,721 findings. Run over
// `extractProse` output, 972. The ~1,750 difference was markdown mistaken for writing, in three
// clusters:
//
//   1,  788  formatting/em-dash-density. DASH_RE is /—|--/g, and in technical prose `--` is a CLI
//            flag (`--config`) or a table separator (`|---|`) far more often than it is a dash.
//            The rule suppresses inside a fence but not inside an inline code span.
//   2,  ~700 discourse/punchy-fragments, anaphora/repeated-opening, repetition/near-duplicate,
//            firing on table rows and link lists.
//   3,   74  dead-metaphor/rare-lemma, on `guides` and `operate` — both path segments inside a
//            link target, both rare enough as English lemmas to look figurative.
//
// BLANKED, NOT DELETED. Every removed character becomes a space, and newlines are kept. The output
// is therefore the same LENGTH as the input, which means a Span produced from it still indexes the
// original document: `source.slice(finding.span.start, finding.span.end)` is the real text, and a
// line number counted from it is the real line number. Deleting instead would be shorter to write
// and would silently make every reported offset wrong. Keeping newlines additionally preserves
// paragraph and list grouping for anything downstream that reads structure.
//
// NOT A MARKDOWN PARSER, deliberately, and for the reason the module beside it gives: a line scan
// gets these shapes right, and a CommonMark implementation is a dependency this package does not
// otherwise need. What it does not handle is written per-pattern below rather than in a list here.

import { markdownContext } from "./markdown.js";
import type { Span } from "./types.js";

// Replace [start, end) with spaces, keeping newlines.
function blankSpan(text: string, { start, end }: Span): string {
  let filled = "";
  for (let i = start; i < end; i++) filled += text[i] === "\n" ? "\n" : " ";
  return text.slice(0, start) + filled + text.slice(end);
}

// Applied in order. Order matters only where two could overlap: fenced code is removed first (by
// markdownContext, above the loop), so a table row or a backtick INSIDE a code block is already
// gone and cannot re-match across the hole it left.
const PATTERNS: readonly { name: string; re: RegExp }[] = [
  // HTML comments. Also covers the `<!-- GENERATED FILE`-style markers some doc pipelines use.
  { name: "html comment", re: /<!--[\s\S]*?-->/g },
  // A block-level HTML element opened at the start of a line, through its matching close tag.
  // Text inside an inlined <svg> is labels on a picture, and a raw <table> is a table. Nesting of
  // the SAME tag is not handled (no <div> inside a <div>); that needs a parser, and the failure
  // mode is under-blanking, which leaves prose in rather than taking prose out.
  { name: "html block", re: /^<(svg|div|table|details|figure|picture|p|blockquote)\b[\s\S]*?<\/\1>/gim },
  // Any line starting with a pipe is a table row. Cell content is often prose, but it is prose in
  // fragments with no sentence structure, which is what the discourse tier misreads.
  { name: "table row", re: /^ {0,3}\|.*$/gm },
  // Inline code spans, with the same backtick-run matching a fence uses so ``a ` b`` stays whole.
  { name: "inline code", re: /(`+)[^\n]*?\1/g },
  // A list item that is only a link is navigation. A "Related" section of six of them is what
  // repeated-opening and near-duplicate kept reporting as an authorial tic. This runs BEFORE
  // "link target" and matches the whole item, because that pattern consumes the closing `]` and
  // would leave nothing here to recognise.
  { name: "nav list item", re: /^ {0,3}[-*+] +\[[^\]]*\]\([^)\s]*(?:\s+"[^"]*")?\)[.,]?[ \t]*$/gm },
  // A link's target, not its text: `[Deploy an instance](guides/operate/deploy.md)` keeps
  // "Deploy an instance" and drops the path. Cluster 3 above is entirely this.
  { name: "link target", re: /\]\([^)\s]*(?:\s+"[^"]*")?\)/g },
  { name: "link definition", re: /^ {0,3}\[[^\]]+\]:\s*\S+.*$/gm },
  { name: "bare url", re: /<https?:\/\/[^>\s]+>|https?:\/\/\S+/g },
  // Alt text is not prose in the flow of the page.
  { name: "image", re: /!\[[^\]]*\]/g },
  // The admonition directive line of the MkDocs/python-markdown dialect (`!!! tip "In a hurry?"`).
  // The BODY is prose and stays; the marker and its quoted title are a widget label, and a title
  // phrased as a question is what a callout title is supposed to be, not a self-posed question.
  { name: "admonition directive", re: /^ *(?:!!!|\?\?\?\+?) +[a-z-]+(?: +"[^"\n]*")? *$/gim },
];

// Everything in `text` that is not prose, blanked to spaces. The return value has the same length
// as the input, so any Span taken from it indexes the input unchanged.
export function extractProse(text: string): string {
  // Fenced code first, and from markdownContext rather than a second fence regex here, so this
  // module and the formatting rules agree on what a fence is by construction.
  let out = text;
  for (const fence of [...markdownContext(text).codeFences].reverse()) out = blankSpan(out, fence);

  for (const { re } of PATTERNS) {
    re.lastIndex = 0;
    // Collect, then blank in reverse: mutating the string under an active regex would shift every
    // subsequent match. Lengths never change, so the collected offsets stay valid either way, but
    // reverse order keeps that true without depending on it.
    const spans: Span[] = [];
    for (let m = re.exec(out); m; m = re.exec(out)) {
      spans.push({ start: m.index, end: m.index + m[0].length });
      if (m[0].length === 0) re.lastIndex++; // a zero-width match would loop forever
    }
    for (const span of spans.reverse()) out = blankSpan(out, span);
  }
  return out;
}

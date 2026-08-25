import { describe, it, expect } from "vitest";
import { segmentSpans } from "./highlight.js";
import type { Span } from "../lint/types.js";

const span = (start: number, end: number): Span => ({ start, end });

describe("segmentSpans", () => {
  it("covers the whole text as one plain segment when there are no spans", () => {
    expect(segmentSpans(10, [])).toEqual([{ start: 0, end: 10, findingIdxs: [] }]);
  });

  it("is empty for an empty document", () => {
    expect(segmentSpans(0, [])).toEqual([]);
  });

  it("produces plain-text gaps around a single span", () => {
    const segs = segmentSpans(10, [span(3, 6)]);
    expect(segs).toEqual([
      { start: 0, end: 3, findingIdxs: [] },
      { start: 3, end: 6, findingIdxs: [0] },
      { start: 6, end: 10, findingIdxs: [] },
    ]);
  });

  it("keeps two disjoint spans separate, each tagged with its own index", () => {
    const segs = segmentSpans(10, [span(1, 3), span(5, 8)]);
    expect(segs).toEqual([
      { start: 0, end: 1, findingIdxs: [] },
      { start: 1, end: 3, findingIdxs: [0] },
      { start: 3, end: 5, findingIdxs: [] },
      { start: 5, end: 8, findingIdxs: [1] },
      { start: 8, end: 10, findingIdxs: [] },
    ]);
  });

  it("stacks a nested span inside a wider one instead of nesting tags", () => {
    // span 0 is the whole sentence, span 1 is one word inside it — three segments come out:
    // before the word (rule 0 only), the word itself (rules 0 and 1), after the word (rule 0 only).
    const segs = segmentSpans(10, [span(0, 10), span(4, 6)]);
    expect(segs).toEqual([
      { start: 0, end: 4, findingIdxs: [0] },
      { start: 4, end: 6, findingIdxs: [0, 1] },
      { start: 6, end: 10, findingIdxs: [0] },
    ]);
  });

  it("stacks two identical spans from different rules into one segment with both indices", () => {
    const segs = segmentSpans(10, [span(2, 5), span(2, 5)]);
    expect(segs).toEqual([
      { start: 0, end: 2, findingIdxs: [] },
      { start: 2, end: 5, findingIdxs: [0, 1] },
      { start: 5, end: 10, findingIdxs: [] },
    ]);
  });

  it("handles a partial (crossing) overlap with three segments, the middle one stacked", () => {
    const segs = segmentSpans(10, [span(0, 6), span(4, 10)]);
    expect(segs).toEqual([
      { start: 0, end: 4, findingIdxs: [0] },
      { start: 4, end: 6, findingIdxs: [0, 1] },
      { start: 6, end: 10, findingIdxs: [1] },
    ]);
  });

  it("ignores an out-of-bounds span rather than throwing", () => {
    // index 0 starts negative, index 1 ends past the document — both ignored; index 2 is the only
    // span that actually contributes a cut or a covering index.
    const segs = segmentSpans(5, [span(-1, 3), span(2, 8), span(2, 4)]);
    expect(segs).toEqual([
      { start: 0, end: 2, findingIdxs: [] },
      { start: 2, end: 4, findingIdxs: [2] },
      { start: 4, end: 5, findingIdxs: [] },
    ]);
  });

  it("spans that touch but do not overlap produce no zero-width segment between them", () => {
    const segs = segmentSpans(10, [span(0, 4), span(4, 8)]);
    expect(segs).toEqual([
      { start: 0, end: 4, findingIdxs: [0] },
      { start: 4, end: 8, findingIdxs: [1] },
      { start: 8, end: 10, findingIdxs: [] },
    ]);
  });
});

// Turning a list of (possibly overlapping) finding spans into markup-ready segments.
//
// OVERLAP CHOICE: stack, don't nest. Finding spans come from independent rules and can overlap in
// any pattern — one fully inside another, partial overlap, two identical spans (a different rule
// flagging the exact same words) — and arbitrary overlap is not representable as a tree of nested
// tags in general (only laminar/non-crossing overlaps are). Rather than special-case the nestable
// subset, we sweep every span's start/end into a sorted list of breakpoints (a classic interval
// flattening) and emit one flat, non-overlapping segment per gap between consecutive breakpoints.
// Each segment carries the index of every input span that fully covers it, so a segment covered by
// two findings renders as a single "stacked" mark (see destink/ui.ts) instead of nested marks. This
// is simplest-correct: one linear scan, no tree, and it degrades gracefully — a segment with zero
// covering findings is just plain text.

import type { Span } from "../lint/types.js";

export type Segment = { start: number; end: number; findingIdxs: number[] };

// `spans[i]` is keyed by its position in the input array — callers pass finding spans in the same
// order as their findings list, so `findingIdxs` doubles as "which findings" without a second map.
export function segmentSpans(textLength: number, spans: readonly Span[]): Segment[] {
  const inBounds = (s: Span): boolean => s.start >= 0 && s.end >= s.start && s.end <= textLength;

  const cuts = new Set<number>([0, textLength]);
  for (const s of spans) {
    if (!inBounds(s)) continue; // defensive: ignore bad input rather than throw or mis-segment
    cuts.add(s.start);
    cuts.add(s.end);
  }
  const points = [...cuts].sort((a, b) => a - b);

  const segments: Segment[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const start = points[i]!;
    const end = points[i + 1]!;
    if (start === end) continue;
    const findingIdxs: number[] = [];
    spans.forEach((s, idx) => {
      if (inBounds(s) && s.start <= start && s.end >= end) findingIdxs.push(idx);
    });
    segments.push({ start, end, findingIdxs });
  }
  return segments;
}

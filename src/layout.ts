// Layout — measure/arrange with a 2-D footprint. The novel, risky core (Phase 3).
// R-K nodes consume space on two interacting axes: horizontal room on the baseline AND a
// diagonal footprint below. Adjacent words' below-clusters can collide independently of
// baseline spacing — which is why constituency-tree layout engines do not transfer.

import type { Clause } from "./ir.js";
import type { Scene, BBox } from "./scene.js";
import type { LayoutStyle } from "./theme.js";

// Text measurement is the one genuinely backend-specific concern in layout; inject it as a port.
export interface TextMetrics {
  measure(text: string, sizePx: number): { width: number; ascent: number; descent: number };
}

// measure() returns a footprint, not a width.
export type Footprint = {
  baselineWidth: number; // horizontal room the head needs ON the rail
  below: BBox; // bbox of everything hanging beneath, relative to the head's left anchor
};

// The crux rule (Phase 3): between baseline-adjacent heads i and i+1,
//   gap = max(dividerGap, below_i.right - below_{i+1}.left)
// keeping their hanging clusters from colliding.

// Phase 3 will implement this. Stubbed so the contracts compile in Phase 0.
export function layout(_ir: Clause, _metrics: TextMetrics, _style: LayoutStyle): Scene {
  throw new Error("layout() not implemented until Phase 3");
}

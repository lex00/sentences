// Geometric collision detector — finds label↔label overlaps in a laid-out Scene. The automated
// overlap oracle: deterministic, headless, names the exact colliding words. R-K lines legitimately
// cross, so we only flag overlapping TEXT (two words drawn on top of each other).
//
// Labels are ORIENTED boxes: a rotated label (an article/adverb on a slant) is a tilted rectangle,
// not an axis-aligned one — so a slanted word below the baseline doesn't falsely "overlap" the
// word above it. Boxes use the font's real ascent/descent; intersection is the Separating-Axis Test.

import type { Scene, SceneNode } from "./scene.js";
import { isNode } from "./scene.js";
import type { TextMetrics } from "./layout.js";

type Pt = [number, number];
type OBB = { text: string; pts: Pt[] };
export type Collision = { a: string; b: string; overlap: number };

function obbOf(text: string, anchor: { x: number; y: number }, angle: number, m: TextMetrics, sizePx: number): OBB {
  const { width, ascent, descent } = m.measure(text, sizePx);
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  // Use cap-height (~0.72·ascent), not the font's full ascent, which is taller than the actual
  // letter ink and would make adjacent slant labels clip falsely.
  const top = ascent * 0.72;
  const local: Pt[] = [[0, -top], [width, -top], [width, descent], [0, descent]];
  return { text, pts: local.map(([lx, ly]): Pt => [anchor.x + lx * c - ly * s, anchor.y + lx * s + ly * c]) };
}

// Minimum penetration depth between two convex quads via SAT; 0 if separated.
function overlapDepth(a: OBB, b: OBB): number {
  let min = Infinity;
  for (const poly of [a.pts, b.pts]) {
    for (let i = 0; i < 4; i++) {
      const p1 = poly[i]!;
      const p2 = poly[(i + 1) % 4]!;
      const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) || 1;
      const nx = -(p2[1] - p1[1]) / len;
      const ny = (p2[0] - p1[0]) / len;
      let amin = Infinity, amax = -Infinity, bmin = Infinity, bmax = -Infinity;
      for (const [x, y] of a.pts) { const d = x * nx + y * ny; amin = Math.min(amin, d); amax = Math.max(amax, d); }
      for (const [x, y] of b.pts) { const d = x * nx + y * ny; bmin = Math.min(bmin, d); bmax = Math.max(bmax, d); }
      const o = Math.min(amax, bmax) - Math.max(amin, bmin);
      if (o <= 0) return 0; // separating axis found
      min = Math.min(min, o);
    }
  }
  return min;
}

export function collisions(scene: Scene, metrics: TextMetrics, sizePx: number, tol = 3): Collision[] {
  const boxes: OBB[] = [];
  (function walk(n: SceneNode): void {
    for (const c of n.children) {
      if (isNode(c)) walk(c);
      else if (c.kind === "lbl" && c.text) boxes.push(obbOf(c.text, c.anchor, c.angle, metrics, sizePx));
    }
  })(scene.root);

  const out: Collision[] = [];
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const d = overlapDepth(boxes[i]!, boxes[j]!);
      if (d > tol) out.push({ a: boxes[i]!.text, b: boxes[j]!.text, overlap: Math.round(d) });
    }
  }
  return out;
}

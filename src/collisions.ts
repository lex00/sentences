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
type OBB = { text: string; pts: Pt[]; owner: string };
export type Collision = { a: string; b: string; overlap: number };

function obbOf(text: string, anchor: { x: number; y: number }, angle: number, m: TextMetrics, sizePx: number, owner: string): OBB {
  const { width, ascent, descent } = m.measure(text, sizePx);
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  // Use cap-height (~0.72·ascent), not the font's full ascent, which is taller than the actual
  // letter ink and would make adjacent slant labels clip falsely.
  const top = ascent * 0.72;
  const local: Pt[] = [[0, -top], [width, -top], [width, descent], [0, descent]];
  return { text, owner, pts: local.map(([lx, ly]): Pt => [anchor.x + lx * c - ly * s, anchor.y + lx * s + ly * c]) };
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

// --- segment-through-label detection (a line crossing a word, e.g. a divider through "big") ---

const centroid = (o: OBB): Pt => [(o.pts[0]![0] + o.pts[1]![0] + o.pts[2]![0] + o.pts[3]![0]) / 4, (o.pts[0]![1] + o.pts[1]![1] + o.pts[2]![1] + o.pts[3]![1]) / 4];

// Shrink an OBB toward its centre so a line merely TANGENT to an edge (the word's own baseline /
// slant, which it sits on) isn't counted — only lines through the interior are.
function inset(o: OBB, d: number): OBB {
  const [cx, cy] = centroid(o);
  return {
    text: o.text,
    owner: o.owner,
    pts: o.pts.map(([x, y]): Pt => {
      const dx = cx - x;
      const dy = cy - y;
      const len = Math.hypot(dx, dy) || 1;
      return [x + (dx / len) * d, y + (dy / len) * d];
    }),
  };
}

const pointInOBB = (p: Pt, o: OBB): boolean => {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = o.pts[i]!;
    const b = o.pts[(i + 1) % 4]!;
    const cross = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
    if (cross !== 0) {
      const s = Math.sign(cross);
      if (sign === 0) sign = s;
      else if (s !== sign) return false;
    }
  }
  return true;
};

const segCross = (p1: Pt, p2: Pt, p3: Pt, p4: Pt): boolean => {
  const d = (a: Pt, b: Pt, c: Pt) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const d1 = d(p3, p4, p1), d2 = d(p3, p4, p2), d3 = d(p1, p2, p3), d4 = d(p1, p2, p4);
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
};

function segmentHitsOBB(a: Pt, b: Pt, o: OBB): boolean {
  if (pointInOBB(a, o) || pointInOBB(b, o)) return true;
  for (let i = 0; i < 4; i++) if (segCross(a, b, o.pts[i]!, o.pts[(i + 1) % 4]!)) return true;
  return false;
}

export function collisions(scene: Scene, metrics: TextMetrics, sizePx: number, tol = 3): Collision[] {
  const boxes: OBB[] = [];
  const segs: [Pt, Pt, string, string][] = []; // a, b, role, owner-node-id
  // ancestor owner is prepended so a label can be excluded from lines in its own subtree
  (function walk(n: SceneNode, path: string): void {
    const here = `${path}>${n.id}`;
    for (const c of n.children) {
      if (isNode(c)) walk(c, here);
      else if (c.kind === "lbl" && c.text) boxes.push(obbOf(c.text, c.anchor, c.angle, metrics, sizePx, here));
      else if (c.kind === "seg") segs.push([[c.a.x, c.a.y], [c.b.x, c.b.y], c.role, here]);
    }
  })(scene.root, "");

  const out: Collision[] = [];
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const d = overlapDepth(boxes[i]!, boxes[j]!);
      if (d > tol) out.push({ a: boxes[i]!.text, b: boxes[j]!.text, overlap: Math.round(d) });
    }
  }
  // a line passing through a word's interior (e.g. a divider through "big"), excluding the word's
  // OWN attachment lines (its slant/rail live in the SAME node — same owner path)
  for (const box of boxes) {
    const small = inset(box, 3);
    for (const [a, b, role, owner] of segs) {
      if (owner === box.owner) continue; // the word's own slant/rail
      if (segmentHitsOBB(a, b, small)) out.push({ a: box.text, b: `line:${role}`, overlap: 0 });
    }
  }
  return out;
}

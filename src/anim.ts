// Motion — the portable Animator spine. Reactive diff-and-tween, keyed by stable id.
// This layer is renderer-agnostic; the Canvas spike (Phase 2) validates it.
//
// Refinement to DESIGN.md: the Scene stays PURE GEOMETRY. Transient per-instant visual
// state (enter/exit presence -> alpha) rides in a RenderFrame wrapper handed to the executor,
// so motion never leaks into the Scene contract.

import type { Scene, SceneNode, Prim, NodeId } from "./scene.js";
import { isNode } from "./scene.js";

export type Transition =
  | { kind: "enter"; node: SceneNode } // in next, not prev
  | { kind: "update"; from: SceneNode; to: SceneNode } // in both, moved -> tween (morph & reflow)
  | { kind: "exit"; node: SceneNode }; // in prev, not next

// Injectable so determinism / export is a later swap, not a rewrite.
export interface Clock {
  now(): number; // ms
}
export const wallClock: Clock = { now: () => performance.now() };

export type Easing = (t: number) => number; // [0,1] -> [0,1]
export const easeInOutCubic: Easing = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

// What the executor draws each frame: geometry + per-node presence (alpha) for this instant.
export type RenderFrame = { scene: Scene; presence: ReadonlyMap<NodeId, number> };

const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
const lerpPt = (a: { x: number; y: number }, b: { x: number; y: number }, u: number) => ({
  x: lerp(a.x, b.x, u),
  y: lerp(a.y, b.y, u),
});

function lerpPrim(a: Prim, b: Prim, u: number): Prim {
  if (a.kind === "seg" && b.kind === "seg") return { ...b, a: lerpPt(a.a, b.a, u), b: lerpPt(a.b, b.b, u) };
  if (a.kind === "lbl" && b.kind === "lbl")
    return { ...b, anchor: lerpPt(a.anchor, b.anchor, u), angle: lerp(a.angle, b.angle, u) };
  return b; // kind changed — snap to target
}

const directPrims = (n: SceneNode): Prim[] => n.children.filter((c): c is Prim => !isNode(c));
const childNodes = (n: SceneNode): SceneNode[] => n.children.filter(isNode);

// Interpolate two matched (same-id) nodes; record presence for enter/exit subtrees.
function interpNode(from: SceneNode, to: SceneNode, u: number, presence: Map<NodeId, number>): SceneNode {
  const fp = directPrims(from);
  const tp = directPrims(to);
  const prims: Prim[] = fp.length === tp.length ? tp.map((p, i) => lerpPrim(fp[i]!, p, u)) : tp;

  const byId = new Map<NodeId, { from?: SceneNode; to?: SceneNode }>();
  for (const c of childNodes(from)) byId.set(c.id, { from: c });
  for (const c of childNodes(to)) byId.set(c.id, { ...byId.get(c.id), to: c });

  const kids: SceneNode[] = [];
  for (const { from: f, to: t } of byId.values()) {
    if (f && t) kids.push(interpNode(f, t, u, presence));
    else if (t) {
      presence.set(t.id, u); // enter: fade in
      kids.push(t);
    } else if (f) {
      presence.set(f.id, 1 - u); // exit: fade out, keep last geometry
      kids.push(f);
    }
  }
  return { ...to, children: [...prims, ...kids] };
}

// Reactive diff-and-tween. setTarget() captures the on-screen geometry as the new baseline
// and animates toward the next Scene; sample() yields the RenderFrame for a given clock time.
export class Animator {
  private from: Scene | null = null;
  private to: Scene;
  private start = 0;
  private lastFrame: Scene;

  constructor(
    initial: Scene,
    private clock: Clock = wallClock,
    private duration = 600,
    private easing: Easing = easeInOutCubic,
  ) {
    this.to = initial;
    this.lastFrame = initial;
  }

  // Diagnostic: the transition set between two scenes (used in tests / inspection).
  diff(prev: Scene | null, next: Scene): Transition[] {
    const out: Transition[] = [];
    const recur = (f: SceneNode | undefined, t: SceneNode | undefined) => {
      if (f && t) {
        out.push({ kind: "update", from: f, to: t });
        const byId = new Map<NodeId, { from?: SceneNode; to?: SceneNode }>();
        for (const c of childNodes(f)) byId.set(c.id, { from: c });
        for (const c of childNodes(t)) byId.set(c.id, { ...byId.get(c.id), to: c });
        for (const p of byId.values()) recur(p.from, p.to);
      } else if (t) out.push({ kind: "enter", node: t });
      else if (f) out.push({ kind: "exit", node: f });
    };
    recur(prev?.root, next.root);
    return out;
  }

  setTarget(next: Scene): void {
    this.from = this.lastFrame; // morph from wherever we are now
    this.to = next;
    this.start = this.clock.now();
  }

  sample(now: number = this.clock.now()): { frame: RenderFrame; settled: boolean } {
    if (!this.from) {
      this.lastFrame = this.to;
      return { frame: { scene: this.to, presence: new Map() }, settled: true };
    }
    const raw = Math.min(1, Math.max(0, (now - this.start) / this.duration));
    const u = this.easing(raw);
    const presence = new Map<NodeId, number>();
    const root = interpNode(this.from.root, this.to.root, u, presence);
    const scene: Scene = { root, bounds: this.to.bounds };
    this.lastFrame = scene;
    const settled = raw >= 1;
    if (settled) this.from = null;
    return { frame: { scene, presence }, settled };
  }
}

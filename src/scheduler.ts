// EffectScheduler — the portable "CSS for animation" engine. It matches Animator transitions
// (and ad-hoc events like select/hover) against EffectBindings, spawns EffectInstances, and
// expires them by duration. Renderer-agnostic: it produces instances; the executor runs them.

import type { EffectBinding, EffectInstance, EffectEvent, RoleSelector, EffectDesc } from "./effects.js";
import type { Transition, Clock } from "./anim.js";
import type { SceneNode, Pt, Scene } from "./scene.js";
import { isNode } from "./scene.js";

const center = (n: SceneNode): Pt => ({
  x: (n.bounds.left + n.bounds.right) / 2,
  y: (n.bounds.top + n.bounds.bottom) / 2,
});

const durationOf = (d: EffectDesc): number =>
  d.kind === "particles" ? d.emitter.lifetime : d.kind === "shader" ? 400 : d.dur;
// shader gets a nominal lifetime so the instance reaches the executor, which then SKIPS it via
// supports("shader") === false — the deferral proven at the capability boundary, not by expiry.

const subtreeHasPrim = (n: SceneNode, role: string): boolean => {
  let found = false;
  (function w(x: SceneNode): void {
    for (const c of x.children) {
      if (!isNode(c) && (role === "*" || c.role === role)) found = true;
      if (isNode(c)) w(c);
    }
  })(n);
  return found;
};

const matches = (sel: RoleSelector, n: SceneNode): boolean =>
  sel.on === "node" ? sel.role === "*" || n.role === sel.role : subtreeHasPrim(n, sel.role);

export class EffectScheduler {
  private active: EffectInstance[] = [];
  private seq = 0;

  constructor(
    private bindings: EffectBinding[],
    private clock: Clock,
  ) {}

  private fire(event: EffectEvent, node: SceneNode, now: number): void {
    for (const b of this.bindings) {
      if (b.event !== event) continue;
      if (!matches(b.match, node)) continue;
      this.active.push({ id: `fx${this.seq++}`, desc: b.effect, anchor: center(node), spawnedAt: now, target: node });
    }
  }

  // Map Animator transitions to effects (enter/update/exit).
  onTransitions(ts: Transition[], now: number = this.clock.now()): void {
    for (const t of ts) this.fire(t.kind, t.kind === "update" ? t.to : t.node, now);
  }

  // Ad-hoc events not derived from a diff (select, hover, idle).
  fireEvent(event: EffectEvent, node: SceneNode, now: number = this.clock.now()): void {
    this.fire(event, node, now);
  }

  // Active instances at `now`, after expiring finished ones.
  sample(now: number = this.clock.now()): EffectInstance[] {
    this.active = this.active.filter((fx) => now - fx.spawnedAt < durationOf(fx.desc));
    return this.active;
  }
}

// Deepest node whose bounds contain p (for click -> select).
export function hitTest(scene: Scene, p: Pt): SceneNode | null {
  let hit: SceneNode | null = null;
  (function w(n: SceneNode): void {
    const b = n.bounds;
    if (p.x >= b.left && p.x <= b.right && p.y >= b.top && p.y <= b.bottom) hit = n;
    for (const c of n.children) if (isNode(c)) w(c);
  })(scene.root);
  return hit;
}

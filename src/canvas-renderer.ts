// Canvas2D EffectExecutor — the research-spike renderer (Phase 2). The ONLY renderer-specific
// code in the system: it consumes a RenderFrame (pure-geometry Scene + per-node presence) and
// a Theme, and knows nothing about grammar. The WebGPU executor (Phase 7) swaps in here.

import type { EffectExecutor, EffectInstance, EffectDesc } from "./effects.js";
import type { RenderFrame } from "./anim.js";
import type { Theme, FontSpec } from "./theme.js";
import type { SceneNode, Prim, NodeId, Pt } from "./scene.js";
import { isNode } from "./scene.js";

const fontStr = (f: FontSpec) =>
  `${f.style ?? "normal"} ${f.weight ?? 400} ${f.size}px ${f.family}`;

// Seeded RNG (deterministic-ready): particles vary by instance id + index, not Math.random.
const hashStr = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};
const mulberry32 = (seed: number) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

type Particle = { x: number; y: number; vx: number; vy: number; life: number; age: number; r: number };
const lerpPt = (a: Pt, b: Pt, u: number): Pt => ({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u });

export class CanvasExecutor implements EffectExecutor {
  private g: CanvasRenderingContext2D;
  private theme: Theme | null = null;
  private sims = new Map<string, Particle[]>(); // executor-owned simulation state
  private last = 0;
  private frameT = -1;
  private dt = 16;

  constructor(
    private canvas: HTMLCanvasElement,
    private cssW: number,
    private cssH: number,
  ) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas context unavailable");
    this.g = ctx;
  }

  private fit(): void {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.style.width = `${this.cssW}px`;
    this.canvas.style.height = `${this.cssH}px`;
    this.canvas.width = Math.round(this.cssW * dpr);
    this.canvas.height = Math.round(this.cssH * dpr);
    this.g.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  drawScene(frame: RenderFrame, theme: Theme): void {
    this.theme = theme;
    this.fit();
    this.g.clearRect(0, 0, this.cssW, this.cssH);
    this.walk(frame.scene.root, 1, frame.presence, theme);
  }

  private walk(node: SceneNode, inherited: number, presence: ReadonlyMap<NodeId, number>, theme: Theme): void {
    const alpha = inherited * (presence.get(node.id) ?? 1);
    if (alpha <= 0.001) return; // fully faded subtree — skip
    for (const child of node.children) {
      if (isNode(child)) this.walk(child, alpha, presence, theme);
      else this.drawPrim(child, alpha, theme);
    }
  }

  private drawPrim(p: Prim, alpha: number, theme: Theme): void {
    const g = this.g;
    g.save();
    g.globalAlpha = alpha;
    if (p.kind === "seg") {
      const s = theme.stroke(p.role);
      g.strokeStyle = s.color;
      g.lineWidth = s.weight;
      g.lineCap = s.cap ?? "butt";
      g.setLineDash(s.dash ?? []);
      g.beginPath();
      g.moveTo(p.a.x, p.a.y);
      g.lineTo(p.b.x, p.b.y);
      g.stroke();
    } else {
      const f = theme.font(p.role);
      g.translate(p.anchor.x, p.anchor.y);
      g.rotate(p.angle);
      g.fillStyle = theme.stroke(p.role).color;
      g.font = fontStr(f);
      g.textBaseline = "alphabetic";
      g.fillText(p.text, 0, 0);
    }
    g.restore();
  }

  supports(kind: EffectDesc["kind"]): boolean {
    return kind !== "shader"; // the deferral, expressed as a capability flag
  }

  run(fx: EffectInstance, t: number): void {
    this.syncClock(t);
    if (fx.desc.kind === "particles") this.runParticles(fx);
    else if (fx.desc.kind === "draw-on") this.runDrawOn(fx, t);
    // fade/transform are presence-driven (Animator); shader is unsupported here.
  }

  // One dt per frame, shared across all run() calls at the same timestamp.
  private syncClock(t: number): void {
    if (t === this.frameT) return;
    this.dt = this.last === 0 ? 16 : Math.min(50, t - this.last);
    this.last = t;
    this.frameT = t;
  }

  private runParticles(fx: EffectInstance): void {
    if (fx.desc.kind !== "particles") return;
    const e = fx.desc.emitter;
    let ps = this.sims.get(fx.id);
    if (!ps) {
      const rng = mulberry32(hashStr(fx.id));
      ps = Array.from({ length: e.count }, () => {
        const ang = -Math.PI / 2 + (rng() * 2 - 1) * e.spread;
        const sp = e.speed * (0.5 + rng());
        return { x: fx.anchor.x, y: fx.anchor.y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, life: e.lifetime, age: 0, r: 1 + rng() * 2.5 };
      });
      this.sims.set(fx.id, ps);
    }
    const dts = this.dt / 1000;
    const grav = e.gravity ?? 0;
    const color = this.theme?.emphasis("word", "active").color ?? "#e0791a";
    const g = this.g;
    g.save();
    g.globalCompositeOperation = "lighter"; // additive glow
    for (const p of ps) {
      p.age += this.dt;
      p.vy += grav * dts;
      p.x += p.vx * dts;
      p.y += p.vy * dts;
      const a = Math.max(0, 1 - p.age / p.life);
      if (a <= 0) continue;
      g.globalAlpha = a;
      g.fillStyle = color;
      g.beginPath();
      g.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
    if (ps.every((p) => p.age >= p.life)) this.sims.delete(fx.id);
  }

  private runDrawOn(fx: EffectInstance, t: number): void {
    if (fx.desc.kind !== "draw-on" || !fx.target) return;
    const p = Math.min(1, (t - fx.spawnedAt) / fx.desc.dur);
    const color = this.theme?.emphasis("baseline", "active").color ?? "#0b3d91";
    const g = this.g;
    g.save();
    g.strokeStyle = color;
    g.lineWidth = 2.4;
    g.lineCap = "round";
    g.globalAlpha = 0.9 * (1 - p) + 0.25; // the trace fades as the real strokes settle in
    (function trace(n: SceneNode): void {
      for (const c of n.children) {
        if (isNode(c)) trace(c);
        else if (c.kind === "seg") {
          const end = lerpPt(c.a, c.b, p);
          g.beginPath();
          g.moveTo(c.a.x, c.a.y);
          g.lineTo(end.x, end.y);
          g.stroke();
        }
      }
    })(fx.target);
    g.restore();
  }
}

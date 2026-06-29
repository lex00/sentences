// Canvas2D EffectExecutor — the research-spike renderer (Phase 2). The ONLY renderer-specific
// code in the system: it consumes a RenderFrame (pure-geometry Scene + per-node presence) and
// a Theme, and knows nothing about grammar. The WebGPU executor (Phase 7) swaps in here.

import type { EffectExecutor, EffectInstance, EffectDesc } from "./effects.js";
import type { RenderFrame } from "./anim.js";
import type { Theme, FontSpec } from "./theme.js";
import type { SceneNode, Prim, NodeId } from "./scene.js";
import { isNode } from "./scene.js";

const fontStr = (f: FontSpec) =>
  `${f.style ?? "normal"} ${f.weight ?? 400} ${f.size}px ${f.family}`;

export class CanvasExecutor implements EffectExecutor {
  private g: CanvasRenderingContext2D;

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

  // Particles land in Phase 5; shaders are deferred to the WebGPU executor (Phase 7).
  run(_fx: EffectInstance, _t: number): void {
    /* no-op until Phase 5 */
  }

  supports(kind: EffectDesc["kind"]): boolean {
    return kind !== "shader"; // the deferral, expressed as a capability flag
  }
}

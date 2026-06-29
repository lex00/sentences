// WebGPU executor (Phase 7) — the rich-graphics payoff. HYBRID by design:
//   • Canvas2D draws the diagram (crisp text + lines) — delegated to CanvasExecutor.
//   • WebGPU rasterizes particles as instanced soft-glow quads on a transparent overlay.
//   • The deferred "shader" glow binding LIGHTS UP here: supports("shader") === true.
//
// Per the Phase 5 bench, the particle SIM stays on the CPU (shared via particles.ts); the GPU
// does only rasterization + the fragment-shader glow — exactly the measured Canvas2D bottleneck.
//
// ⚠️ UNVERIFIED IN THIS REPO: there is no GPU/browser in the headless env, so this code is
// built and typechecked but NOT run. makeExecutor() falls back to the proven CanvasExecutor
// when WebGPU is unavailable, so the app still works everywhere.

import type { EffectExecutor, EffectInstance, EffectDesc } from "./effects.js";
import type { RenderFrame } from "./anim.js";
import type { Theme } from "./theme.js";
import { CanvasExecutor } from "./canvas-renderer.js";
import { spawnParticles, updateParticles, particleAlpha, type Particle } from "./particles.js";

const PARTICLE_WGSL = /* wgsl */ `
struct Uni { res: vec2f, glow: f32, _pad: f32, color: vec4f };
@group(0) @binding(0) var<uniform> uni: Uni;

struct VSOut { @builtin(position) pos: vec4f, @location(0) uv: vec2f, @location(1) alpha: f32 };

@vertex
fn vs(@location(0) corner: vec2f, @location(1) inst: vec4f) -> VSOut {
  let radius = inst.z * (1.0 + uni.glow * 1.5);          // glow effect widens the sprite
  let px = inst.xy + corner * radius;                     // pixel-space (y down)
  let clip = vec2f(px.x / uni.res.x * 2.0 - 1.0, 1.0 - px.y / uni.res.y * 2.0);
  var o: VSOut;
  o.pos = vec4f(clip, 0.0, 1.0);
  o.uv = corner;
  o.alpha = inst.w;
  return o;
}

@fragment
fn fs(in: VSOut) -> @location(0) vec4f {
  let d = length(in.uv);
  let core = smoothstep(1.0, 0.0, d);                     // soft round falloff
  let a = pow(core, 1.0 + uni.glow * 3.0) * in.alpha;     // glow softens/extends the halo
  return vec4f(uni.color.rgb * a, a);                     // premultiplied -> additive blend
}`;

const QUAD = new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]);

const hexToRgb = (hex: string): [number, number, number] => {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.replace(/(.)/g, "$1$1") : h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

// Owns the WebGPU device + particle pipeline. Renders one additive pass per frame.
class GpuParticleLayer {
  private constructor(
    private device: GPUDevice,
    private ctx: GPUCanvasContext,
    private pipeline: GPURenderPipeline,
    private quadBuf: GPUBuffer,
    private instBuf: GPUBuffer,
    private uniBuf: GPUBuffer,
    private bindGroup: GPUBindGroup,
    private cssW: number,
    private cssH: number,
  ) {}

  static async create(stage: HTMLCanvasElement, cssW: number, cssH: number, maxInstances: number): Promise<GpuParticleLayer | null> {
    if (!("gpu" in navigator) || !navigator.gpu) return null;
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return null;
    const device = await adapter.requestDevice();

    const overlay = document.createElement("canvas");
    const dpr = window.devicePixelRatio || 1;
    overlay.width = Math.round(cssW * dpr);
    overlay.height = Math.round(cssH * dpr);
    Object.assign(overlay.style, {
      position: "absolute",
      left: `${stage.offsetLeft}px`,
      top: `${stage.offsetTop}px`,
      width: `${cssW}px`,
      height: `${cssH}px`,
      pointerEvents: "none",
    });
    stage.parentElement?.appendChild(overlay);

    const ctx = overlay.getContext("webgpu");
    if (!ctx) return null;
    const format = navigator.gpu.getPreferredCanvasFormat();
    ctx.configure({ device, format, alphaMode: "premultiplied" });

    const module = device.createShaderModule({ code: PARTICLE_WGSL });
    const pipeline = device.createRenderPipeline({
      layout: "auto",
      vertex: {
        module,
        entryPoint: "vs",
        buffers: [
          { arrayStride: 8, stepMode: "vertex", attributes: [{ shaderLocation: 0, offset: 0, format: "float32x2" }] },
          { arrayStride: 16, stepMode: "instance", attributes: [{ shaderLocation: 1, offset: 0, format: "float32x4" }] },
        ],
      },
      fragment: {
        module,
        entryPoint: "fs",
        targets: [
          {
            format,
            blend: {
              color: { srcFactor: "one", dstFactor: "one", operation: "add" },
              alpha: { srcFactor: "one", dstFactor: "one", operation: "add" },
            },
          },
        ],
      },
      primitive: { topology: "triangle-list" },
    });

    const quadBuf = device.createBuffer({ size: QUAD.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(quadBuf, 0, QUAD as GPUAllowSharedBufferSource);
    const instBuf = device.createBuffer({ size: maxInstances * 16, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    const uniBuf = device.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: uniBuf } }],
    });

    return new GpuParticleLayer(device, ctx, pipeline, quadBuf, instBuf, uniBuf, bindGroup, cssW, cssH);
  }

  render(data: Float32Array, count: number, color: [number, number, number], glow: number): void {
    const dev = this.device;
    if (count > 0) dev.queue.writeBuffer(this.instBuf, 0, data as GPUAllowSharedBufferSource, 0, count * 4);
    dev.queue.writeBuffer(this.uniBuf, 0, new Float32Array([this.cssW, this.cssH, glow, 0, color[0], color[1], color[2], 1]) as GPUAllowSharedBufferSource);

    const enc = dev.createCommandEncoder();
    const view = this.ctx.getCurrentTexture().createView();
    const pass = enc.beginRenderPass({
      colorAttachments: [{ view, clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: "clear", storeOp: "store" }],
    });
    if (count > 0) {
      pass.setPipeline(this.pipeline);
      pass.setVertexBuffer(0, this.quadBuf);
      pass.setVertexBuffer(1, this.instBuf);
      pass.setBindGroup(0, this.bindGroup);
      pass.draw(6, count);
    }
    pass.end();
    dev.queue.submit([enc.finish()]);
  }
}

export class HybridExecutor implements EffectExecutor {
  private sims = new Map<string, Particle[]>(); // executor-owned CPU sim state
  private batch: Float32Array;
  private count = 0;
  private glow = 0;
  private theme: Theme | null = null;
  private last = 0;
  private frameT = -1;
  private dt = 16;

  constructor(
    private canvas: CanvasExecutor,
    private gpu: GpuParticleLayer,
    private maxInstances: number,
  ) {
    this.batch = new Float32Array(maxInstances * 4);
  }

  drawScene(frame: RenderFrame, theme: Theme): void {
    this.theme = theme;
    this.canvas.drawScene(frame, theme); // crisp text + lines on the 2D layer
    this.count = 0; // reset GPU batch for this frame
    this.glow = 0;
  }

  run(fx: EffectInstance, t: number): void {
    this.syncClock(t);
    if (fx.desc.kind === "particles") this.accumulate(fx);
    else if (fx.desc.kind === "shader") this.glow = 1; // the deferred glow, now live
    else this.canvas.run(fx, t); // draw-on / fade stay on the 2D layer
  }

  endFrame(): void {
    const color = hexToRgb(this.theme?.emphasis("word", "active").color ?? "#e0791a");
    this.gpu.render(this.batch, this.count, color, this.glow);
  }

  supports(_kind: EffectDesc["kind"]): boolean {
    return true; // WebGPU lights up everything, including "shader"
  }

  private syncClock(t: number): void {
    if (t === this.frameT) return;
    this.dt = this.last === 0 ? 16 : Math.min(50, t - this.last);
    this.last = t;
    this.frameT = t;
  }

  private accumulate(fx: EffectInstance): void {
    if (fx.desc.kind !== "particles") return;
    let ps = this.sims.get(fx.id);
    if (!ps) {
      ps = spawnParticles(fx.desc.emitter, fx.anchor, fx.id);
      this.sims.set(fx.id, ps);
    }
    const dead = updateParticles(ps, this.dt, fx.desc.emitter.gravity ?? 0);
    for (const p of ps) {
      const a = particleAlpha(p);
      if (a <= 0 || this.count >= this.maxInstances) continue;
      const o = this.count * 4;
      this.batch[o] = p.x;
      this.batch[o + 1] = p.y;
      this.batch[o + 2] = p.r * 3; // sprite radius (the soft halo is larger than the dot)
      this.batch[o + 3] = a;
      this.count++;
    }
    if (dead) this.sims.delete(fx.id);
  }
}

// Try WebGPU; fall back to the proven CanvasExecutor when it's unavailable.
export async function makeExecutor(canvas: HTMLCanvasElement, cssW: number, cssH: number): Promise<EffectExecutor> {
  const canvasExec = new CanvasExecutor(canvas, cssW, cssH);
  try {
    const gpu = await GpuParticleLayer.create(canvas, cssW, cssH, 100_000);
    if (gpu) return new HybridExecutor(canvasExec, gpu, 100_000);
  } catch {
    /* GPU init failed — use Canvas */
  }
  return canvasExec;
}

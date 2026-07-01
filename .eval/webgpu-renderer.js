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
import { CanvasExecutor } from "./canvas-renderer.js";
import { spawnParticles, updateParticles, particleAlpha } from "./particles.js";
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
const hexToRgb = (hex) => {
    const h = hex.replace("#", "");
    const n = parseInt(h.length === 3 ? h.replace(/(.)/g, "$1$1") : h, 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};
// Owns the WebGPU device + particle pipeline. Renders one additive pass per frame.
class GpuParticleLayer {
    device;
    ctx;
    pipeline;
    quadBuf;
    instBuf;
    uniBuf;
    bindGroup;
    cssW;
    cssH;
    constructor(device, ctx, pipeline, quadBuf, instBuf, uniBuf, bindGroup, cssW, cssH) {
        this.device = device;
        this.ctx = ctx;
        this.pipeline = pipeline;
        this.quadBuf = quadBuf;
        this.instBuf = instBuf;
        this.uniBuf = uniBuf;
        this.bindGroup = bindGroup;
        this.cssW = cssW;
        this.cssH = cssH;
    }
    static async create(stage, cssW, cssH, maxInstances) {
        if (!("gpu" in navigator) || !navigator.gpu)
            return null;
        const adapter = await navigator.gpu.requestAdapter();
        if (!adapter)
            return null;
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
        if (!ctx)
            return null;
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
        device.queue.writeBuffer(quadBuf, 0, QUAD);
        const instBuf = device.createBuffer({ size: maxInstances * 16, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
        const uniBuf = device.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
        const bindGroup = device.createBindGroup({
            layout: pipeline.getBindGroupLayout(0),
            entries: [{ binding: 0, resource: { buffer: uniBuf } }],
        });
        return new GpuParticleLayer(device, ctx, pipeline, quadBuf, instBuf, uniBuf, bindGroup, cssW, cssH);
    }
    render(data, count, color, glow) {
        const dev = this.device;
        if (count > 0)
            dev.queue.writeBuffer(this.instBuf, 0, data, 0, count * 4);
        dev.queue.writeBuffer(this.uniBuf, 0, new Float32Array([this.cssW, this.cssH, glow, 0, color[0], color[1], color[2], 1]));
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
export class HybridExecutor {
    canvas;
    gpu;
    maxInstances;
    sims = new Map(); // executor-owned CPU sim state
    batch;
    count = 0;
    glow = 0;
    theme = null;
    last = 0;
    frameT = -1;
    dt = 16;
    constructor(canvas, gpu, maxInstances) {
        this.canvas = canvas;
        this.gpu = gpu;
        this.maxInstances = maxInstances;
        this.batch = new Float32Array(maxInstances * 4);
    }
    drawScene(frame, theme) {
        this.theme = theme;
        this.canvas.drawScene(frame, theme); // crisp text + lines on the 2D layer
        this.count = 0; // reset GPU batch for this frame
        this.glow = 0;
    }
    run(fx, t) {
        this.syncClock(t);
        if (fx.desc.kind === "particles")
            this.accumulate(fx);
        else if (fx.desc.kind === "shader")
            this.glow = 1; // the deferred glow, now live
        else
            this.canvas.run(fx, t); // draw-on / fade stay on the 2D layer
    }
    endFrame() {
        const color = hexToRgb(this.theme?.emphasis("word", "active").color ?? "#e0791a");
        this.gpu.render(this.batch, this.count, color, this.glow);
    }
    supports(_kind) {
        return true; // WebGPU lights up everything, including "shader"
    }
    syncClock(t) {
        if (t === this.frameT)
            return;
        this.dt = this.last === 0 ? 16 : Math.min(50, t - this.last);
        this.last = t;
        this.frameT = t;
    }
    accumulate(fx) {
        if (fx.desc.kind !== "particles")
            return;
        let ps = this.sims.get(fx.id);
        if (!ps) {
            ps = spawnParticles(fx.desc.emitter, fx.anchor, fx.id);
            this.sims.set(fx.id, ps);
        }
        const dead = updateParticles(ps, this.dt, fx.desc.emitter.gravity ?? 0);
        for (const p of ps) {
            const a = particleAlpha(p);
            if (a <= 0 || this.count >= this.maxInstances)
                continue;
            const o = this.count * 4;
            this.batch[o] = p.x;
            this.batch[o + 1] = p.y;
            this.batch[o + 2] = p.r * 3; // sprite radius (the soft halo is larger than the dot)
            this.batch[o + 3] = a;
            this.count++;
        }
        if (dead)
            this.sims.delete(fx.id);
    }
}
// Try WebGPU; fall back to the proven CanvasExecutor when it's unavailable.
export async function makeExecutor(canvas, cssW, cssH) {
    const canvasExec = new CanvasExecutor(canvas, cssW, cssH);
    try {
        const gpu = await GpuParticleLayer.create(canvas, cssW, cssH, 100_000);
        if (gpu)
            return new HybridExecutor(canvasExec, gpu, 100_000);
    }
    catch {
        /* GPU init failed — use Canvas */
    }
    return canvasExec;
}

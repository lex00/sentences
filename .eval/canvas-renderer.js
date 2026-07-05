// Canvas2D EffectExecutor — the research-spike renderer (Phase 2). The ONLY renderer-specific
// code in the system: it consumes a RenderFrame (pure-geometry Scene + per-node presence) and
// a Theme, and knows nothing about grammar. The WebGPU executor (Phase 7) swaps in here.
import { isNode, fitView } from "./scene.js";
import { spawnParticles, updateParticles, particleAlpha } from "./particles.js";
const fontStr = (f) => `${f.style ?? "normal"} ${f.weight ?? 400} ${f.size}px ${f.family}`;
const lerpPt = (a, b, u) => ({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u });
export class CanvasExecutor {
    canvas;
    cssW;
    cssH;
    g;
    theme = null;
    sims = new Map(); // executor-owned simulation state
    last = 0;
    frameT = -1;
    dt = 16;
    constructor(canvas, cssW, cssH) {
        this.canvas = canvas;
        this.cssW = cssW;
        this.cssH = cssH;
        const ctx = canvas.getContext("2d");
        if (!ctx)
            throw new Error("2D canvas context unavailable");
        this.g = ctx;
    }
    fit() {
        const dpr = window.devicePixelRatio || 1;
        this.canvas.style.width = `${this.cssW}px`;
        this.canvas.style.height = `${this.cssH}px`;
        this.canvas.width = Math.round(this.cssW * dpr);
        this.canvas.height = Math.round(this.cssH * dpr);
        this.g.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    view = { s: 1, tx: 0, ty: 0 }; // fit-to-canvas transform (scene -> screen)
    applyView(g) {
        g.translate(this.view.tx, this.view.ty);
        g.scale(this.view.s, this.view.s);
    }
    drawScene(frame, theme) {
        this.theme = theme;
        this.fit();
        this.g.clearRect(0, 0, this.cssW, this.cssH);
        // Fit + center the whole diagram in the canvas (only ever scales DOWN), so long sentences
        // don't overflow / collide with the edges. Shared with pointer hit-testing via fitView().
        this.view = fitView(frame.scene.bounds, this.cssW, this.cssH);
        this.g.save();
        this.applyView(this.g);
        this.walk(frame.scene.root, 1, frame.presence, theme);
        this.g.restore();
    }
    walk(node, inherited, presence, theme) {
        const alpha = inherited * (presence.get(node.id) ?? 1);
        if (alpha <= 0.001)
            return; // fully faded subtree — skip
        for (const child of node.children) {
            if (isNode(child))
                this.walk(child, alpha, presence, theme);
            else
                this.drawPrim(child, alpha, theme);
        }
    }
    drawPrim(p, alpha, theme) {
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
        }
        else {
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
    supports(kind) {
        return kind !== "shader"; // the deferral, expressed as a capability flag
    }
    run(fx, t) {
        this.syncClock(t);
        if (fx.desc.kind === "particles")
            this.runParticles(fx);
        else if (fx.desc.kind === "draw-on")
            this.runDrawOn(fx, t);
        // fade/transform are presence-driven (Animator); shader is unsupported here.
    }
    // One dt per frame, shared across all run() calls at the same timestamp.
    syncClock(t) {
        if (t === this.frameT)
            return;
        this.dt = this.last === 0 ? 16 : Math.min(50, t - this.last);
        this.last = t;
        this.frameT = t;
    }
    runParticles(fx) {
        if (fx.desc.kind !== "particles")
            return;
        const e = fx.desc.emitter;
        let ps = this.sims.get(fx.id);
        if (!ps) {
            ps = spawnParticles(e, fx.anchor, fx.id); // shared CPU sim
            this.sims.set(fx.id, ps);
        }
        const dead = updateParticles(ps, this.dt, e.gravity ?? 0);
        const color = this.theme?.emphasis("word", "active").color ?? "#e0791a";
        const g = this.g;
        g.save();
        this.applyView(g); // particles live in scene space — match the fit transform
        g.globalCompositeOperation = "lighter"; // additive glow
        for (const p of ps) {
            const a = particleAlpha(p);
            if (a <= 0)
                continue;
            g.globalAlpha = a;
            g.fillStyle = color;
            g.beginPath();
            g.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            g.fill();
        }
        g.restore();
        if (dead)
            this.sims.delete(fx.id);
    }
    runDrawOn(fx, t) {
        if (fx.desc.kind !== "draw-on" || !fx.target)
            return;
        const p = Math.min(1, (t - fx.spawnedAt) / fx.desc.dur);
        const color = this.theme?.emphasis("baseline", "active").color ?? "#0b3d91";
        const g = this.g;
        g.save();
        this.applyView(g); // draw-on trace lives in scene space — match the fit transform
        g.strokeStyle = color;
        g.lineWidth = 2.4;
        g.lineCap = "round";
        g.globalAlpha = 0.9 * (1 - p) + 0.25; // the trace fades as the real strokes settle in
        (function trace(n) {
            for (const c of n.children) {
                if (isNode(c))
                    trace(c);
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

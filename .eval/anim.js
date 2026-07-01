// Motion — the portable Animator spine. Reactive diff-and-tween, keyed by stable id.
// This layer is renderer-agnostic; the Canvas spike (Phase 2) validates it.
//
// Refinement to DESIGN.md: the Scene stays PURE GEOMETRY. Transient per-instant visual
// state (enter/exit presence -> alpha) rides in a RenderFrame wrapper handed to the executor,
// so motion never leaks into the Scene contract.
import { isNode } from "./scene.js";
export const wallClock = { now: () => performance.now() };
export const easeInOutCubic = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const lerp = (a, b, u) => a + (b - a) * u;
const lerpPt = (a, b, u) => ({
    x: lerp(a.x, b.x, u),
    y: lerp(a.y, b.y, u),
});
function lerpPrim(a, b, u) {
    if (a.kind === "seg" && b.kind === "seg")
        return { ...b, a: lerpPt(a.a, b.a, u), b: lerpPt(a.b, b.b, u) };
    if (a.kind === "lbl" && b.kind === "lbl")
        return { ...b, anchor: lerpPt(a.anchor, b.anchor, u), angle: lerp(a.angle, b.angle, u) };
    return b; // kind changed — snap to target
}
const directPrims = (n) => n.children.filter((c) => !isNode(c));
const childNodes = (n) => n.children.filter(isNode);
// Interpolate two matched (same-id) nodes; record presence for enter/exit subtrees.
function interpNode(from, to, u, presence) {
    const fp = directPrims(from);
    const tp = directPrims(to);
    const prims = fp.length === tp.length ? tp.map((p, i) => lerpPrim(fp[i], p, u)) : tp;
    const byId = new Map();
    for (const c of childNodes(from))
        byId.set(c.id, { from: c });
    for (const c of childNodes(to))
        byId.set(c.id, { ...byId.get(c.id), to: c });
    const kids = [];
    for (const { from: f, to: t } of byId.values()) {
        if (f && t)
            kids.push(interpNode(f, t, u, presence));
        else if (t) {
            presence.set(t.id, u); // enter: fade in
            kids.push(t);
        }
        else if (f) {
            presence.set(f.id, 1 - u); // exit: fade out, keep last geometry
            kids.push(f);
        }
    }
    return { ...to, children: [...prims, ...kids] };
}
// Reactive diff-and-tween. setTarget() captures the on-screen geometry as the new baseline
// and animates toward the next Scene; sample() yields the RenderFrame for a given clock time.
export class Animator {
    clock;
    duration;
    easing;
    from = null;
    to;
    start = 0;
    lastFrame;
    constructor(initial, clock = wallClock, duration = 600, easing = easeInOutCubic) {
        this.clock = clock;
        this.duration = duration;
        this.easing = easing;
        this.to = initial;
        this.lastFrame = initial;
    }
    // Diagnostic: the transition set between two scenes (used in tests / inspection).
    diff(prev, next) {
        const out = [];
        const recur = (f, t) => {
            if (f && t) {
                out.push({ kind: "update", from: f, to: t });
                const byId = new Map();
                for (const c of childNodes(f))
                    byId.set(c.id, { from: c });
                for (const c of childNodes(t))
                    byId.set(c.id, { ...byId.get(c.id), to: c });
                for (const p of byId.values())
                    recur(p.from, p.to);
            }
            else if (t)
                out.push({ kind: "enter", node: t });
            else if (f)
                out.push({ kind: "exit", node: f });
        };
        recur(prev?.root, next.root);
        return out;
    }
    setTarget(next) {
        this.from = this.lastFrame; // morph from wherever we are now
        this.to = next;
        this.start = this.clock.now();
    }
    sample(now = this.clock.now()) {
        if (!this.from) {
            this.lastFrame = this.to;
            return { frame: { scene: this.to, presence: new Map() }, settled: true };
        }
        const raw = Math.min(1, Math.max(0, (now - this.start) / this.duration));
        const u = this.easing(raw);
        const presence = new Map();
        const root = interpNode(this.from.root, this.to.root, u, presence);
        const scene = { root, bounds: this.to.bounds };
        this.lastFrame = scene;
        const settled = raw >= 1;
        if (settled)
            this.from = null;
        return { frame: { scene, presence }, settled };
    }
}

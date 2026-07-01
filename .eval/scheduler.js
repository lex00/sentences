// EffectScheduler — the portable "CSS for animation" engine. It matches Animator transitions
// (and ad-hoc events like select/hover) against EffectBindings, spawns EffectInstances, and
// expires them by duration. Renderer-agnostic: it produces instances; the executor runs them.
import { isNode } from "./scene.js";
const center = (n) => ({
    x: (n.bounds.left + n.bounds.right) / 2,
    y: (n.bounds.top + n.bounds.bottom) / 2,
});
const durationOf = (d) => d.kind === "particles" ? d.emitter.lifetime : d.kind === "shader" ? 400 : d.dur;
// shader gets a nominal lifetime so the instance reaches the executor, which then SKIPS it via
// supports("shader") === false — the deferral proven at the capability boundary, not by expiry.
const subtreeHasPrim = (n, role) => {
    let found = false;
    (function w(x) {
        for (const c of x.children) {
            if (!isNode(c) && (role === "*" || c.role === role))
                found = true;
            if (isNode(c))
                w(c);
        }
    })(n);
    return found;
};
const matches = (sel, n) => sel.on === "node" ? sel.role === "*" || n.role === sel.role : subtreeHasPrim(n, sel.role);
export class EffectScheduler {
    bindings;
    clock;
    active = [];
    seq = 0;
    constructor(bindings, clock) {
        this.bindings = bindings;
        this.clock = clock;
    }
    fire(event, node, now) {
        for (const b of this.bindings) {
            if (b.event !== event)
                continue;
            if (!matches(b.match, node))
                continue;
            this.active.push({ id: `fx${this.seq++}`, desc: b.effect, anchor: center(node), spawnedAt: now, target: node });
        }
    }
    // Map Animator transitions to effects (enter/update/exit).
    onTransitions(ts, now = this.clock.now()) {
        for (const t of ts)
            this.fire(t.kind, t.kind === "update" ? t.to : t.node, now);
    }
    // Ad-hoc events not derived from a diff (select, hover, idle).
    fireEvent(event, node, now = this.clock.now()) {
        this.fire(event, node, now);
    }
    // Active instances at `now`, after expiring finished ones.
    sample(now = this.clock.now()) {
        this.active = this.active.filter((fx) => now - fx.spawnedAt < durationOf(fx.desc));
        return this.active;
    }
}
// Deepest node whose bounds contain p (for click -> select).
export function hitTest(scene, p) {
    let hit = null;
    (function w(n) {
        const b = n.bounds;
        if (p.x >= b.left && p.x <= b.right && p.y >= b.top && p.y <= b.bottom)
            hit = n;
        for (const c of n.children)
            if (isNode(c))
                w(c);
    })(scene.root);
    return hit;
}

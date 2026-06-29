import { describe, it, expect } from "vitest";
import { layout, type TextMetrics } from "./layout.js";
import { irA, irCompound } from "./fixtures.js";
import { Animator } from "./anim.js";
import { EffectScheduler, hitTest } from "./scheduler.js";
import type { EffectBinding } from "./effects.js";

const metrics: TextMetrics = {
  measure: (t, sz) => ({ width: t.length * sz * 0.55, ascent: sz * 0.8, descent: sz * 0.2 }),
};
const A = () => layout(irA, metrics);
const C = () => layout(irCompound, metrics);

const bindings: EffectBinding[] = [
  { event: "enter", match: { on: "node", role: "clause" }, effect: { kind: "draw-on", dur: 500 } },
  { event: "enter", match: { on: "node", role: "*" }, effect: { kind: "particles", emitter: { count: 10, lifetime: 700, speed: 100, spread: 1 } } },
  { event: "enter", match: { on: "node", role: "clause" }, effect: { kind: "shader", pass: "glow" } },
  { event: "select", match: { on: "node", role: "*" }, effect: { kind: "particles", emitter: { count: 40, lifetime: 900, speed: 200, spread: 3 } } },
];

describe("EffectScheduler binding resolution", () => {
  it("fires matching bindings for an entering clause (incl. the deferred shader instance)", () => {
    let t = 0;
    const s = new EffectScheduler(bindings, { now: () => t });
    s.fireEvent("enter", A().root); // root role = clause
    const kinds = s.sample(0).map((fx) => fx.desc.kind).sort();
    expect(kinds).toEqual(["draw-on", "particles", "shader"]);
  });

  it("expires instances by duration", () => {
    let t = 0;
    const s = new EffectScheduler(bindings, { now: () => t });
    s.fireEvent("enter", A().root);
    expect(s.sample(0).length).toBe(3);
    expect(s.sample(450).map((f) => f.desc.kind).sort()).toEqual(["draw-on", "particles"]); // shader (400) gone
    expect(s.sample(600).map((f) => f.desc.kind)).toEqual(["particles"]); // draw-on (500) gone
    expect(s.sample(800).length).toBe(0); // particles (700) gone
  });

  it("maps Animator enter transitions to per-node effects", () => {
    let t = 0;
    const s = new EffectScheduler(bindings, { now: () => t });
    // A -> compound: branches c/subj/b0,b1 and c/obj enter; each matches the wildcard particle binding.
    const ts = new Animator(A()).diff(A(), C());
    const enters = ts.filter((x) => x.kind === "enter");
    expect(enters.length).toBeGreaterThanOrEqual(3);
    s.onTransitions(ts, 0);
    const fx = s.sample(0);
    expect(fx.length).toBe(enters.length);
    expect(fx.every((f) => f.desc.kind === "particles")).toBe(true);
    expect(fx.every((f) => f.target !== undefined)).toBe(true); // carries target geometry
  });

  it("fires a burst on an ad-hoc select event at the hit node", () => {
    let t = 0;
    const s = new EffectScheduler(bindings, { now: () => t });
    const scene = A();
    const node = hitTest(scene, { x: scene.root.bounds.left + 1, y: 250 });
    expect(node).not.toBeNull();
    s.fireEvent("select", node!);
    const fx = s.sample(0);
    expect(fx).toHaveLength(1);
    expect(fx[0]!.desc.kind).toBe("particles");
  });
});

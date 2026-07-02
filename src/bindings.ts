// Effect bindings as DATA. Swapping this array changes which effects fire where, with no
// change to the scheduler, the executor, or the layout. This is the authoring surface.

import type { EffectBinding } from "./effects.js";

export const defaultBindings: EffectBinding[] = [
  // Staged reveal: trace the rails of a freshly-entered clause/subclause.
  { event: "enter", match: { on: "node", role: "clause" }, effect: { kind: "draw-on", dur: 550 } },
  { event: "enter", match: { on: "node", role: "subclause" }, effect: { kind: "draw-on", dur: 450 } },

  // A small puff of particles whenever any node enters (e.g. a modifier appears during a morph).
  {
    event: "enter",
    match: { on: "node", role: "*" },
    effect: { kind: "particles", emitter: { count: 14, lifetime: 700, speed: 120, spread: 1.2, gravity: 320 } },
  },

  // DEFERRED to WebGPU (Phase 7): a glow shader pass. Present in the model; the Canvas executor
  // reports supports("shader") === false and silently skips it. Proof that deferral is a
  // capability flag, not a missing feature.
  { event: "enter", match: { on: "node", role: "clause" }, effect: { kind: "shader", pass: "glow" } },
];

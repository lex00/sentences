// Effects — authored as DATA ("CSS for animation"), plus the one per-renderer seam:
// the EffectExecutor. The spine hands the executor effect *instances*, never draw calls;
// particle simulation state lives inside the executor.

import type { Scene, Pt, NodeRole, Role } from "./scene.js";
import type { Theme } from "./theme.js";
import type { Easing } from "./anim.js";

export type EmitterSpec = {
  count: number;
  lifetime: number; // ms
  speed: number;
  spread: number; // radians
  gravity?: number;
};

export type EffectDesc =
  | { kind: "draw-on"; dur: number; easing?: Easing } // geometry reveal  ┐ spine can resolve
  | { kind: "fade"; dur: number; easing?: Easing } //                    ├─ into the tweened scene
  | { kind: "transform"; dur: number; easing?: Easing } //              ┘
  | { kind: "particles"; emitter: EmitterSpec } // executor simulates (CPU on Canvas, GPU later)
  | { kind: "shader"; pass: string }; // DEFERRED — Canvas executor no-ops via supports()

export type EffectEvent = "enter" | "update" | "exit" | "idle" | "hover" | "select";

// Selector over the scene graph — role of a primitive or role of a node.
export type RoleSelector =
  | { on: "prim"; role: Role }
  | { on: "node"; role: NodeRole };

export type EffectBinding = {
  event: EffectEvent;
  match: RoleSelector;
  effect: EffectDesc;
};

// A live effect: the descriptor plus where/when it fired. The executor owns its sim state.
export type EffectInstance = {
  id: string;
  desc: EffectDesc;
  anchor: Pt;
  spawnedAt: number; // ms (Clock time)
};

// The ONLY per-renderer part of the system.
export interface EffectExecutor {
  drawScene(scene: Scene, theme: Theme): void;
  run(fx: EffectInstance, t: number): void;
  supports(kind: EffectDesc["kind"]): boolean; // Canvas: false for "shader"
}

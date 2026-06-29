// Motion — the portable Animator spine. Reactive diff-and-tween, keyed by stable id.
// This layer is renderer-agnostic; the Canvas spike validates it.

import type { Scene, SceneNode } from "./scene.js";

export type Transition =
  | { kind: "enter"; node: SceneNode } // in next, not prev
  | { kind: "update"; from: SceneNode; to: SceneNode } // in both, moved -> tween (morph & reflow)
  | { kind: "exit"; node: SceneNode }; // in prev, not next

// Injectable so determinism / export is a later swap, not a rewrite.
export interface Clock {
  now(): number; // ms
}

export const wallClock: Clock = { now: () => performance.now() };

export type Easing = (t: number) => number; // [0,1] -> [0,1]

// Animator diffs two Scenes into transitions; the tween scheduler resolves a tweened
// Scene at time t. (stub — implemented in Phase 2)
export interface Animator {
  diff(prev: Scene | null, next: Scene): Transition[];
  // Returns the interpolated Scene for the current clock time, plus whether motion is settled.
  sample(t: number): { scene: Scene; settled: boolean };
}

// Phase 5: effects authored as DATA. Space cycles sentences (morph + draw-on reveal + particle
// puffs on entering nodes); click a node for a particle burst; T swaps theme. The shader binding
// is silently skipped (Canvas executor reports supports("shader") === false) — proof of deferral.

import { cycle } from "./fixtures.js";
import { Animator, wallClock } from "./anim.js";
import { CanvasExecutor } from "./canvas-renderer.js";
import { layout, CanvasTextMetrics } from "./layout.js";
import { defaultTheme, blueprintTheme, defaultLayoutStyle } from "./theme.js";
import { EffectScheduler, hitTest } from "./scheduler.js";
import { defaultBindings } from "./bindings.js";

const CSS_W = 900;
const CSS_H = 500;

const metrics = new CanvasTextMetrics();
const scenes = cycle.map((ir) => layout(ir, metrics, defaultLayoutStyle));

const canvas = document.getElementById("stage") as HTMLCanvasElement;
const executor = new CanvasExecutor(canvas, CSS_W, CSS_H);
const animator = new Animator(scenes[0]!, wallClock);
const scheduler = new EffectScheduler(defaultBindings, wallClock);

const themes = [defaultTheme, blueprintTheme];
let themeIdx = 0;
let sceneIdx = 0;

// Reveal the first sentence on load.
scheduler.fireEvent("enter", scenes[0]!.root);

function cycleNext(): void {
  const prev = scenes[sceneIdx]!;
  sceneIdx = (sceneIdx + 1) % scenes.length;
  const next = scenes[sceneIdx]!;
  scheduler.onTransitions(animator.diff(prev, next));
  animator.setTarget(next);
}

canvas.addEventListener("click", (e) => {
  const rect = canvas.getBoundingClientRect();
  const hit = hitTest(scenes[sceneIdx]!, { x: e.clientX - rect.left, y: e.clientY - rect.top });
  if (hit) scheduler.fireEvent("select", hit);
});

window.addEventListener("keydown", (e) => {
  if (e.key === " " || e.key === "Enter") {
    e.preventDefault();
    cycleNext();
  } else if (e.key.toLowerCase() === "t") {
    themeIdx = (themeIdx + 1) % themes.length;
  }
});

function loop(): void {
  const now = wallClock.now();
  const { frame } = animator.sample(now);
  executor.drawScene(frame, themes[themeIdx]!);
  for (const fx of scheduler.sample(now)) {
    if (executor.supports(fx.desc.kind)) executor.run(fx, now);
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

if (import.meta.hot) {
  import.meta.hot.accept();
}

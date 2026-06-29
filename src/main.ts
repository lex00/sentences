// Phase 2: reactive diff-and-tween in action. Toggle between two hardcoded Scenes
// (click or press space) and watch the diagram MORPH — reflow, fade-out, fade-in —
// instead of snapping. Proves the portable Animator spine + the Canvas executor seam.

import { irA, irB } from "./fixtures.js";
import { Animator, wallClock } from "./anim.js";
import { CanvasExecutor } from "./canvas-renderer.js";
import { layout, CanvasTextMetrics } from "./layout.js";
import { defaultTheme, defaultLayoutStyle } from "./theme.js";

const CSS_W = 900;
const CSS_H = 500;

// Phase 3: Scenes now come from the real layout engine, not the fixture placer.
const metrics = new CanvasTextMetrics();
const sceneA = layout(irA, metrics, defaultLayoutStyle);
const sceneB = layout(irB, metrics, defaultLayoutStyle);

const canvas = document.getElementById("stage") as HTMLCanvasElement;
const executor = new CanvasExecutor(canvas, CSS_W, CSS_H);
const animator = new Animator(sceneA, wallClock);
const theme = defaultTheme;

let showingA = true;
function toggle(): void {
  showingA = !showingA;
  animator.setTarget(showingA ? sceneA : sceneB);
}

canvas.addEventListener("click", toggle);
window.addEventListener("keydown", (e) => {
  if (e.key === " " || e.key === "Enter") {
    e.preventDefault();
    toggle();
  }
});

function loop(): void {
  const { frame } = animator.sample();
  executor.drawScene(frame, theme);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

if (import.meta.hot) {
  import.meta.hot.accept();
}

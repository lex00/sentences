// Phase 2: reactive diff-and-tween in action. Toggle between two hardcoded Scenes
// (click or press space) and watch the diagram MORPH — reflow, fade-out, fade-in —
// instead of snapping. Proves the portable Animator spine + the Canvas executor seam.

import { sceneA, sceneB } from "./fixtures.js";
import { Animator, wallClock } from "./anim.js";
import { CanvasExecutor } from "./canvas-renderer.js";
import { defaultTheme } from "./theme.js";

const CSS_W = 900;
const CSS_H = 500;

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

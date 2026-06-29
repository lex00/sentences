// Phase 4: cycle through fixtures (click / space) to see morph, compounds, and subordinate
// clauses; press T to swap Theme over identical geometry. The diagram MORPHS between sentences
// instead of snapping. Proves the portable spine, the layout engine, and the role->appearance seam.

import { cycle } from "./fixtures.js";
import { Animator, wallClock } from "./anim.js";
import { CanvasExecutor } from "./canvas-renderer.js";
import { layout, CanvasTextMetrics } from "./layout.js";
import { defaultTheme, blueprintTheme, defaultLayoutStyle } from "./theme.js";

const CSS_W = 900;
const CSS_H = 500;

const metrics = new CanvasTextMetrics();
const scenes = cycle.map((ir) => layout(ir, metrics, defaultLayoutStyle));

const canvas = document.getElementById("stage") as HTMLCanvasElement;
const executor = new CanvasExecutor(canvas, CSS_W, CSS_H);
const animator = new Animator(scenes[0]!, wallClock);

const themes = [defaultTheme, blueprintTheme];
let themeIdx = 0;
let sceneIdx = 0;

function next(): void {
  sceneIdx = (sceneIdx + 1) % scenes.length;
  animator.setTarget(scenes[sceneIdx]!);
}

canvas.addEventListener("click", next);
window.addEventListener("keydown", (e) => {
  if (e.key === " " || e.key === "Enter") {
    e.preventDefault();
    next();
  } else if (e.key.toLowerCase() === "t") {
    themeIdx = (themeIdx + 1) % themes.length;
  }
});

function loop(): void {
  const { frame } = animator.sample();
  executor.drawScene(frame, themes[themeIdx]!);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

if (import.meta.hot) {
  import.meta.hot.accept();
}

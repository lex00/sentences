// App entry. Type a sentence -> in-browser parse -> IR -> layout -> morph into view, with
// draw-on reveal + particle effects. Space cycles built-in examples; click a word for a burst;
// T swaps theme. Parsing is pure TS (no server, no ML stack) — the tool ships as a static site.

import { cycle } from "./fixtures.js";
import { Animator, wallClock } from "./anim.js";
import { makeExecutor } from "./webgpu-renderer.js";
import { layout, CanvasTextMetrics } from "./layout.js";
import { defaultTheme, blueprintTheme, defaultLayoutStyle } from "./theme.js";
import { EffectScheduler, hitTest } from "./scheduler.js";
import { defaultBindings } from "./bindings.js";
import { parse } from "./nlp/parse.js";
import { lowerSentence } from "./lower.js";
import type { EffectExecutor } from "./effects.js";
import type { Scene } from "./scene.js";

const CSS_W = 900;
const CSS_H = 500;

const metrics = new CanvasTextMetrics();
const examples = cycle.map((ir) => layout(ir, metrics, defaultLayoutStyle));

const canvas = document.getElementById("stage") as HTMLCanvasElement;
const input = document.getElementById("sentence") as HTMLInputElement;
const status = document.getElementById("status") as HTMLSpanElement;
const animator = new Animator(examples[0]!, wallClock);
const scheduler = new EffectScheduler(defaultBindings, wallClock);

let executor: EffectExecutor | null = null; // WebGPU hybrid, or Canvas2D fallback
const themes = [defaultTheme, blueprintTheme];
let themeIdx = 0;
let exampleIdx = 0;
let current: Scene = examples[0]!;

// Morph into a new scene: diff against what's on screen, fire enter/exit effects, retarget.
function show(scene: Scene): void {
  scheduler.onTransitions(animator.diff(current, scene));
  animator.setTarget(scene);
  current = scene;
}

scheduler.fireEvent("enter", current.root); // reveal the first sentence on load

input.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  const text = input.value.trim();
  if (!text) return;
  try {
    show(layout(lowerSentence(parse(text)), metrics, defaultLayoutStyle));
    status.textContent = "";
  } catch {
    status.textContent = "couldn't diagram that one — try a simpler sentence";
  }
});

canvas.addEventListener("click", (e) => {
  const rect = canvas.getBoundingClientRect();
  const hit = hitTest(current, { x: e.clientX - rect.left, y: e.clientY - rect.top });
  if (hit) scheduler.fireEvent("select", hit);
});

window.addEventListener("keydown", (e) => {
  if (document.activeElement === input) return; // don't hijack typing
  if (e.key === " " || e.key === "Enter") {
    e.preventDefault();
    exampleIdx = (exampleIdx + 1) % examples.length;
    show(examples[exampleIdx]!);
  } else if (e.key.toLowerCase() === "t") {
    themeIdx = (themeIdx + 1) % themes.length;
  }
});

function loop(): void {
  if (executor) {
    const now = wallClock.now();
    const { frame } = animator.sample(now);
    executor.drawScene(frame, themes[themeIdx]!);
    for (const fx of scheduler.sample(now)) {
      if (executor.supports(fx.desc.kind)) executor.run(fx, now);
    }
    executor.endFrame?.(); // batched renderers (WebGPU) flush/present here
  }
  requestAnimationFrame(loop);
}

makeExecutor(canvas, CSS_W, CSS_H).then((ex) => {
  executor = ex;
  requestAnimationFrame(loop);
});

if (import.meta.hot) {
  import.meta.hot.accept();
}

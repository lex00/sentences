// App entry. Type a sentence -> in-browser parse -> IR -> layout -> morph into view, with
// draw-on reveal + particle effects. Space cycles built-in examples; click a word for a burst;
// T swaps theme. Parsing is pure TS (no server, no ML stack) — the tool ships as a static site.

// Engine surface — the single import point for the diagramming core (see engine.ts).
import {
  layout, CanvasTextMetrics, lowerSentence, describeAt, sceneToSvg,
  fitView, screenToScene, defaultTheme, blueprintTheme, defaultLayoutStyle,
} from "./engine.js";
import type { Scene } from "./engine.js";
// App / presentation layer (not part of the engine): content, animation, renderers, effects.
import { cycle, cycleSentences } from "./fixtures.js";
import { Animator, wallClock } from "./anim.js";
import { makeExecutor } from "./webgpu-renderer.js";
import { EffectScheduler } from "./scheduler.js";
import { defaultBindings } from "./bindings.js";
import "@fontsource/tinos"; // pinned serif — same font the collision tests measure against
import { parseDocument } from "./document.js"; // rule-based fallback parser
import { ModelParser } from "./parser/model-parser.js"; // neural parser (opt-in; pulls in onnxruntime)
import type { EffectExecutor } from "./effects.js";

const CSS_W = 900;
const CSS_H = 500;

void document.fonts.load("16px Tinos"); // request the pinned font early so layout measures it
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

// Alternative parses for an ambiguous sentence — surfaced instead of silently picking one.
const parsesUI = document.getElementById("parses") as HTMLSpanElement;
const parseN = document.getElementById("parsen") as HTMLSpanElement;
let candidates: Scene[] = [];
let candIdx = 0;

function setCandidates(scenes: Scene[]): void {
  candidates = scenes;
  candIdx = 0;
  parsesUI.style.display = scenes.length > 1 ? "" : "none";
  parseN.textContent = `1/${scenes.length}`;
  show(scenes[0]!);
}
function cycleCandidate(delta: number): void {
  if (candidates.length < 2) return;
  candIdx = (candIdx + delta + candidates.length) % candidates.length;
  parseN.textContent = `${candIdx + 1}/${candidates.length}`;
  show(candidates[candIdx]!);
}

// Morph into a new scene: diff against what's on screen, fire enter/exit effects, retarget.
function show(scene: Scene): void {
  scheduler.onTransitions(animator.diff(current, scene));
  animator.setTarget(scene);
  current = scene;
}

input.value = cycleSentences[exampleIdx] ?? ""; // show the first example's sentence in the field
scheduler.fireEvent("enter", current.root); // reveal the first sentence on load

// The neural parser (benepar ONNX, ~72MB) lazy-loads on first focus; rule-based is the fallback.
let model: ModelParser | null = null;
let modelState: "idle" | "loading" | "ready" | "failed" = "idle";
function ensureModel(): void {
  if (modelState !== "idle") return;
  modelState = "loading";
  status.textContent = "loading neural parser (~72 MB, first time)…";
  // Model + configs resolve against the deploy base (root in dev, "/<repo>/" on Pages), served
  // same-origin. VITE_MODEL_URL can override the weights URL if ever hosted on a CORS-enabled CDN.
  const modelsBase = `${import.meta.env.BASE_URL}models`;
  const modelUrl = import.meta.env.VITE_MODEL_URL || `${modelsBase}/benepar.int8.onnx`;
  ModelParser.load(modelsBase, modelUrl)
    .then((mp) => { model = mp; modelState = "ready"; status.textContent = "neural parser ready ✓"; })
    .catch((err) => { modelState = "failed"; console.error("[model load failed]", err); status.textContent = "neural parser failed to load (see console) — using rule-based"; });
}
input.addEventListener("focus", ensureModel);

input.addEventListener("keydown", async (e) => {
  if (e.key !== "Enter") return;
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return;

  if (model) {
    try {
      // k-best parses -> distinct diagrams (ambiguous attachment surfaces as alternatives).
      const trees = await model.parseNBest(text, 5);
      const seen = new Set<string>();
      const scenes: Scene[] = [];
      for (const t of trees) {
        try {
          const ir = lowerSentence(t);
          const key = JSON.stringify(ir);
          if (seen.has(key)) continue; // different parse, same diagram
          seen.add(key);
          scenes.push(layout(ir, metrics, defaultLayoutStyle));
        } catch { /* skip a candidate this lowering can't diagram */ }
      }
      if (!scenes.length) throw new Error("no candidate lowered");
      setCandidates(scenes);
      status.textContent = scenes.length > 1 ? `neural ✓ · ${scenes.length} parses` : "neural ✓";
      return;
    } catch (err) {
      console.error("[neural parse failed]", err);
      status.textContent = "neural parse failed (see console) — trying rule-based";
    }
  }
  try {
    setCandidates([layout(parseDocument(text), metrics, defaultLayoutStyle)]); // rule-based fallback
    status.textContent = model ? "rule-based fallback" : modelState === "loading" ? "rule-based (model still loading…)" : modelState === "failed" ? "rule-based (model failed)" : "rule-based";
  } catch (err) {
    console.error("[rule-based parse failed]", err);
    status.textContent = "couldn't diagram that one — try a simpler sentence";
  }
});

(document.getElementById("prev") as HTMLButtonElement).addEventListener("click", () => cycleCandidate(-1));
(document.getElementById("next") as HTMLButtonElement).addEventListener("click", () => cycleCandidate(1));

// Hover: name the word or line under the pointer (its grammatical role + what it means).
const tip = document.createElement("div");
tip.style.cssText =
  "position:fixed;pointer-events:none;z-index:20;max-width:260px;padding:.4rem .55rem;border-radius:6px;" +
  "background:#2b2b2b;color:#f7f6f2;font:12px/1.35 ui-sans-serif,system-ui,sans-serif;" +
  "box-shadow:0 2px 10px rgba(0,0,0,.28);display:none";
document.body.appendChild(tip);

canvas.addEventListener("mousemove", (e) => {
  const rect = canvas.getBoundingClientRect();
  const sx = (e.clientX - rect.left) * (CSS_W / rect.width); // undo any CSS scaling of the canvas
  const sy = (e.clientY - rect.top) * (CSS_H / rect.height);
  const scenePt = screenToScene({ x: sx, y: sy }, fitView(current.bounds, CSS_W, CSS_H));
  const info = describeAt(current, scenePt, metrics, defaultLayoutStyle.em);
  if (!info) { tip.style.display = "none"; canvas.style.cursor = "default"; return; }
  tip.textContent = "";
  const t = document.createElement("div"); t.style.fontWeight = "600"; t.textContent = info.title;
  const d = document.createElement("div"); d.style.opacity = ".82"; d.style.marginTop = "1px"; d.textContent = info.detail;
  tip.append(t, d);
  tip.style.left = `${e.clientX + 14}px`;
  tip.style.top = `${e.clientY + 14}px`;
  tip.style.display = "block";
  canvas.style.cursor = "help";
});
canvas.addEventListener("mouseleave", () => { tip.style.display = "none"; });

// Export the on-screen diagram as SVG (same Scene + Theme the canvas draws), on a white ground.
function downloadSvg(): void {
  const svg = sceneToSvg(current, themes[themeIdx]!, { background: "#fffdf8" });
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${(input.value.trim() || "diagram").replace(/[^\w]+/g, "-").slice(0, 40).replace(/^-|-$/g, "") || "diagram"}.svg`;
  a.click();
  URL.revokeObjectURL(url);
}
(document.getElementById("export") as HTMLButtonElement).addEventListener("click", downloadSvg);

window.addEventListener("keydown", (e) => {
  // never hijack keys destined for a text field (paste, spaces, typing)
  const t = e.target as HTMLElement | null;
  if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
  if (document.activeElement === input) return;
  if (e.key === " " || e.key === "Enter") {
    e.preventDefault();
    exampleIdx = (exampleIdx + 1) % examples.length;
    input.value = cycleSentences[exampleIdx] ?? ""; // show the sentence the example diagrams
    setCandidates([examples[exampleIdx]!]); // a fixed example has a single parse
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

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
import "@fontsource/tinos"; // pinned serif — same font the collision tests measure against
import { parseDocument } from "./document.js";
import { lowerSentence } from "./lower.js";
import { ModelParser } from "./parser/model-parser.js";
import { sceneToSvg } from "./svg.js";
const CSS_W = 900;
const CSS_H = 500;
void document.fonts.load("16px Tinos"); // request the pinned font early so layout measures it
const metrics = new CanvasTextMetrics();
const examples = cycle.map((ir) => layout(ir, metrics, defaultLayoutStyle));
const canvas = document.getElementById("stage");
const input = document.getElementById("sentence");
const status = document.getElementById("status");
const animator = new Animator(examples[0], wallClock);
const scheduler = new EffectScheduler(defaultBindings, wallClock);
let executor = null; // WebGPU hybrid, or Canvas2D fallback
const themes = [defaultTheme, blueprintTheme];
let themeIdx = 0;
let exampleIdx = 0;
let current = examples[0];
// Morph into a new scene: diff against what's on screen, fire enter/exit effects, retarget.
function show(scene) {
    scheduler.onTransitions(animator.diff(current, scene));
    animator.setTarget(scene);
    current = scene;
}
scheduler.fireEvent("enter", current.root); // reveal the first sentence on load
// The neural parser (benepar ONNX, ~72MB) lazy-loads on first focus; rule-based is the fallback.
let model = null;
let modelState = "idle";
function ensureModel() {
    if (modelState !== "idle")
        return;
    modelState = "loading";
    status.textContent = "loading neural parser (~72 MB, first time)…";
    ModelParser.load()
        .then((mp) => { model = mp; modelState = "ready"; status.textContent = "neural parser ready ✓"; })
        .catch((err) => { modelState = "failed"; console.error("[model load failed]", err); status.textContent = "neural parser failed to load (see console) — using rule-based"; });
}
input.addEventListener("focus", ensureModel);
input.addEventListener("keydown", async (e) => {
    if (e.key !== "Enter")
        return;
    e.preventDefault();
    const text = input.value.trim();
    if (!text)
        return;
    if (model) {
        try {
            show(layout(lowerSentence(await model.parse(text)), metrics, defaultLayoutStyle)); // neural parse
            status.textContent = "neural ✓";
            return;
        }
        catch (err) {
            console.error("[neural parse failed]", err);
            status.textContent = "neural parse failed (see console) — trying rule-based";
        }
    }
    try {
        show(layout(parseDocument(text), metrics, defaultLayoutStyle)); // rule-based fallback
        status.textContent = model ? "rule-based fallback" : modelState === "loading" ? "rule-based (model still loading…)" : modelState === "failed" ? "rule-based (model failed)" : "rule-based";
    }
    catch (err) {
        console.error("[rule-based parse failed]", err);
        status.textContent = "couldn't diagram that one — try a simpler sentence";
    }
});
canvas.addEventListener("click", (e) => {
    const rect = canvas.getBoundingClientRect();
    const hit = hitTest(current, { x: e.clientX - rect.left, y: e.clientY - rect.top });
    if (hit)
        scheduler.fireEvent("select", hit);
});
// Export the on-screen diagram as SVG (same Scene + Theme the canvas draws), on a white ground.
function downloadSvg() {
    const svg = sceneToSvg(current, themes[themeIdx], { background: "#fffdf8" });
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(input.value.trim() || "diagram").replace(/[^\w]+/g, "-").slice(0, 40).replace(/^-|-$/g, "") || "diagram"}.svg`;
    a.click();
    URL.revokeObjectURL(url);
}
document.getElementById("export").addEventListener("click", downloadSvg);
window.addEventListener("keydown", (e) => {
    // never hijack keys destined for a text field (paste, spaces, typing)
    const t = e.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable))
        return;
    if (document.activeElement === input)
        return;
    if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        exampleIdx = (exampleIdx + 1) % examples.length;
        show(examples[exampleIdx]);
    }
    else if (e.key.toLowerCase() === "t") {
        themeIdx = (themeIdx + 1) % themes.length;
    }
});
function loop() {
    if (executor) {
        const now = wallClock.now();
        const { frame } = animator.sample(now);
        executor.drawScene(frame, themes[themeIdx]);
        for (const fx of scheduler.sample(now)) {
            if (executor.supports(fx.desc.kind))
                executor.run(fx, now);
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

// Phase 1: render a handwritten Scene fixture with a throwaway inline walker, to confirm
// the fixtures are well-formed. Phase 2 replaces this with the real Canvas EffectExecutor.

import { sceneA } from "./fixtures.js";
import { isNode, type Scene, type SceneNode, type Prim } from "./scene.js";

const canvas = document.getElementById("stage") as HTMLCanvasElement;
const ctx = canvas.getContext("2d");
if (!ctx) throw new Error("2D canvas context unavailable");
const g = ctx;

// Crisp on retina: back the canvas with devicePixelRatio and scale the drawing context.
function fitToDisplay(cssW: number, cssH: number): void {
  const dpr = window.devicePixelRatio || 1;
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function drawPrim(p: Prim): void {
  if (p.kind === "seg") {
    g.strokeStyle = "#2b2b2b";
    g.lineWidth = p.role === "baseline" || p.role === "rail" ? 1.6 : 1.2;
    g.beginPath();
    g.moveTo(p.a.x, p.a.y);
    g.lineTo(p.b.x, p.b.y);
    g.stroke();
  } else {
    g.save();
    g.translate(p.anchor.x, p.anchor.y);
    g.rotate(p.angle);
    g.fillStyle = "#1a1a1a";
    g.font = "16px ui-serif, Georgia, serif";
    g.textBaseline = "alphabetic";
    g.fillText(p.text, 0, 0);
    g.restore();
  }
}

function walk(node: SceneNode): void {
  for (const child of node.children) {
    if (isNode(child)) walk(child);
    else drawPrim(child);
  }
}

function render(scene: Scene): void {
  const cssW = 900;
  const cssH = 500;
  fitToDisplay(cssW, cssH);
  g.clearRect(0, 0, cssW, cssH);
  walk(scene.root);
}

render(sceneA);

if (import.meta.hot) {
  import.meta.hot.accept();
}

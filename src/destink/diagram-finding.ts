// diagram-the-finding (#26) — the demo no other linter can do. Click a finding, see the offending
// sentence DIAGRAMMED with the pattern lit up: "It is not bold. It is backwards." draws as two
// stacked copular baselines whose right-hand halves mirror each other, with both complements, both
// copulas and the "not" burning in the finding colour. Naming a tell teaches less than showing its
// shape.
//
// This module is the PAINTING half; ./diagram-finding-map.ts is the selection half (which marks
// carry the tell, and whether the finding has a diagrammable shape at all). Everything
// interesting is over there and tested there; here we only put ink on a canvas.
//
// --- usage (the whole integration, from destink.html's finding list) ---
//
//   import { renderFindingDiagram } from "./diagram-finding.js";
//   import { CanvasTextMetrics } from "../engine.js";
//
//   const metrics = new CanvasTextMetrics();          // once, at startup
//   // doc is the DocumentAnalysis from analyzeDocument(parser, text) — pass `metrics` to it too
//   // if you want per-unit elements; this module lays out its own scene either way.
//   const r = renderFindingDiagram(canvas, doc, finding, { metrics, theme: defaultTheme });
//   if (!r.rendered) showTextHighlightInstead(finding, r.reason);
//
// A finding with no diagrammable structure (an em-dash count over a heading, a lexical hit in a
// fragment) comes back { rendered: false, reason } rather than a blank canvas — the caller falls
// back to underlining the span in the text pane.
//
// --- theming ---
//
// theme.ts has no extension point for a colour that isn't a Role: Theme is stroke/font/emphasis
// keyed by the nine drawing roles, and `emphasis` is already spoken for by the game modes' hover /
// active / muted states. Rather than edit the shared theme for one app, the finding palette lives
// here, picked from the theme's own baseline colour: a dark-on-light theme (defaultTheme) gets
// crimson, a light-on-dark one (blueprintTheme) gets hot pink. Both are far from the navy
// (#0b3d91 / #1769aa) and amber (#ffd36b) the role-highlight machinery already uses, so a lit
// finding never reads as a hovered word. If theme.ts ever grows a semantic-colour hook, this is
// the first customer — see the report on #26.

import type { Scene, View, BBox, Pt } from "../scene.js";
import type { SceneElement, WordElement, LineElement } from "../inspect.js";
import type { TextMetrics } from "../layout.js";
import type { Theme, LayoutStyle } from "../theme.js";
import type { DocAnalysis, Finding } from "../lint/types.js";
import { CanvasTextMetrics } from "../layout.js";
import { fitView } from "../scene.js";
import { defaultTheme, defaultLayoutStyle } from "../theme.js";
import { CanvasExecutor } from "../canvas-renderer.js";
import { buildFindingDiagram } from "./diagram-finding-map.js";
import type { FindingDiagram, FindingHighlight, BuildResult } from "./diagram-finding-map.js";

export type { FindingDiagram, FindingHighlight, HighlightStrategy, BuildResult } from "./diagram-finding-map.js";
export { buildFindingDiagram } from "./diagram-finding-map.js";

// --- palette ---

export type FindingPalette = {
  ink: string; // the finding colour: re-drawn word text, re-stroked lines
  halo: string; // translucent wash behind a lit word
  glow: string; // slightly transparent ink for the box outline
};

// Kept local on purpose (see the module header). Both entries are checked against the role
// highlight colours in BOTH shipped themes: crimson vs navy on light, hot pink vs amber on dark.
export const LIGHT_FINDING_PALETTE: FindingPalette = { ink: "#c2185b", halo: "rgba(194, 24, 91, 0.16)", glow: "rgba(194, 24, 91, 0.55)" };
export const DARK_FINDING_PALETTE: FindingPalette = { ink: "#ff5c8a", halo: "rgba(255, 92, 138, 0.22)", glow: "rgba(255, 92, 138, 0.6)" };

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

// Relative luminance of a theme's baseline stroke, 0 (black) to 1 (white). A theme that draws its
// baselines in a light colour is drawing on a dark ground.
function luminance(color: string): number {
  const m = HEX.exec(color.trim());
  if (!m) return 0;
  const h = m[1]!.length === 3 ? m[1]!.split("").map((c) => c + c).join("") : m[1]!;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** The finding colour for a theme — crimson on a light ground, hot pink on a dark one. */
export const findingPalette = (theme: Theme): FindingPalette =>
  luminance(theme.stroke("baseline").color) > 0.5 ? DARK_FINDING_PALETTE : LIGHT_FINDING_PALETTE;

// --- the drawing seam ---
//
// Canvas painting is the one part of this that a node test cannot exercise, so it sits behind an
// interface with exactly two methods. diagram-finding.test.ts drives the whole module through a
// recording surface; the real one is canvasSurface() below.
export type HighlightPaint = {
  scene: Scene;
  elements: readonly SceneElement[]; // the marks to light, already selected
  palette: FindingPalette;
  theme: Theme; // for the label font, so a lit word matches the one underneath it
  metrics: TextMetrics;
  sizePx: number;
};

export interface DiagramSurface {
  drawScene(scene: Scene, theme: Theme): void;
  highlight(paint: HighlightPaint): void;
}

export type RenderOptions = {
  theme?: Theme;
  metrics?: TextMetrics; // required in node; defaults to a browser CanvasTextMetrics
  style?: LayoutStyle;
  sizePx?: number;
  palette?: FindingPalette;
  width?: number; // CSS px; defaults to the canvas's own client/attribute width
  height?: number;
};

export type RenderResult = {
  rendered: boolean;
  reason?: string; // why not, when rendered is false — show the text highlight instead
  diagram?: FindingDiagram; // present when rendered; the scene, its elements and the lit set
};

/**
 * Draw `finding`'s sentence(s) as a Reed-Kellogg diagram on `canvas`, with the marks that carry
 * the tell lit in the finding colour.
 *
 * Returns { rendered: false, reason } — and leaves the canvas untouched — when the finding has no
 * diagrammable structure: a formatting or lexical hit on text that never parsed into a clause, a
 * span that matches no unit, or a sentence the layout engine refused. The caller shows a plain
 * text highlight in that case.
 */
export function renderFindingDiagram(
  canvas: HTMLCanvasElement,
  doc: DocAnalysis,
  finding: Finding,
  opts: RenderOptions = {},
): RenderResult {
  const metrics = opts.metrics ?? browserMetrics();
  const w = opts.width ?? (canvas.clientWidth || canvas.width || 800);
  const h = opts.height ?? (canvas.clientHeight || canvas.height || 360);
  return paintFindingDiagram(canvasSurface(canvas, w, h), doc, finding, { ...opts, metrics });
}

/**
 * renderFindingDiagram's body, against an injected surface. Same contract, no DOM — this is what
 * the tests drive, and what a future SVG/WebGPU target would implement.
 */
export function paintFindingDiagram(
  surface: DiagramSurface,
  doc: DocAnalysis,
  finding: Finding,
  opts: RenderOptions & { metrics: TextMetrics },
): RenderResult {
  const style = opts.style ?? defaultLayoutStyle;
  const sizePx = opts.sizePx ?? style.em;
  const built: BuildResult = buildFindingDiagram(doc, finding, opts.metrics, { style, sizePx });
  if (!built.ok) return { rendered: false, reason: built.reason };

  const theme = opts.theme ?? defaultTheme;
  const palette = opts.palette ?? findingPalette(theme);
  const { diagram } = built;
  surface.drawScene(diagram.scene, theme);
  surface.highlight({ scene: diagram.scene, elements: diagram.highlight.elements, palette, theme, metrics: opts.metrics, sizePx });
  return { rendered: true, diagram };
}

// --- the canvas surface ---

// Only constructed when a caller omits `metrics`, so importing this module in node stays safe
// (CanvasTextMetrics touches `document` in its constructor, not at module load).
const browserMetrics = (): TextMetrics => new CanvasTextMetrics();

/**
 * The real surface: the shared CanvasExecutor for the diagram itself, then the highlight painted
 * on top in the same scene-space transform. The view is recomputed with fitView() on the same
 * bounds and the same canvas size the executor used, so the two never drift.
 */
export function canvasSurface(canvas: HTMLCanvasElement, cssW: number, cssH: number): DiagramSurface {
  const executor = new CanvasExecutor(canvas, cssW, cssH);
  return {
    drawScene(scene, theme) {
      executor.drawScene({ scene, presence: new Map() }, theme);
    },
    highlight({ scene, elements, palette, theme, metrics, sizePx }) {
      const g = canvas.getContext("2d");
      if (!g || elements.length === 0) return;
      // CanvasExecutor.fit() leaves the device-pixel-ratio transform in place; the view goes on
      // top of it, exactly as drawScene does — same fitView(), same bounds, same canvas size, so
      // the highlight can never drift from the strokes underneath it.
      const view = fitView(scene.bounds, cssW, cssH);
      const font = theme.font("word");
      g.save();
      applyView(g, view);
      for (const el of elements) {
        if (el.kind === "word") paintWord(g, el, palette, metrics, sizePx, view, font.family);
        else paintLine(g, el, palette, view);
      }
      g.restore();
    },
  };
}

const applyView = (g: CanvasRenderingContext2D, v: View): void => {
  g.translate(v.tx, v.ty);
  g.scale(v.s, v.s);
};

// A lit word: a rounded wash behind it, then the word re-drawn in the finding colour so it stays
// legible instead of being tinted by a slab of pink.
function paintWord(g: CanvasRenderingContext2D, el: WordElement, p: FindingPalette, metrics: TextMetrics, sizePx: number, view: View, family: string): void {
  const { ascent, descent } = metrics.measure(el.text, sizePx);
  const padX = 3, padY = 2;
  g.save();
  g.translate(el.anchor.x, el.anchor.y);
  g.rotate(el.angle);
  roundRect(g, -padX, -ascent - padY, el.width + padX * 2, ascent + descent + padY * 2, 3);
  g.fillStyle = p.halo;
  g.fill();
  g.strokeStyle = p.glow;
  g.lineWidth = screenPx(1, view);
  g.stroke();
  g.fillStyle = p.ink;
  g.font = `${sizePx}px ${family}`;
  g.textBaseline = "alphabetic";
  g.fillText(el.text, 0, 0);
  g.restore();
}

// A lit line (a lean divider, a fork, a baseline): re-stroked over the theme's own stroke, in the
// finding colour and a little heavier, so the shape of the pattern reads before the words do.
function paintLine(g: CanvasRenderingContext2D, el: LineElement, p: FindingPalette, view: View): void {
  g.save();
  g.strokeStyle = p.ink;
  g.lineWidth = screenPx(2.6, view);
  g.lineCap = "round";
  g.beginPath();
  g.moveTo(el.a.x, el.a.y);
  g.lineTo(el.b.x, el.b.y);
  g.stroke();
  g.restore();
}

// A width in SCREEN px, expressed in the scene units the view transform is scaling — so a
// hairline stays a hairline on a diagram that had to be shrunk to fit.
const screenPx = (px: number, view: View): number => px / Math.max(view.s, 0.05);

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + rr, y);
  g.arcTo(x + w, y, x + w, y + h, rr);
  g.arcTo(x + w, y + h, x, y + h, rr);
  g.arcTo(x, y + h, x, y, rr);
  g.arcTo(x, y, x + w, y, rr);
  g.closePath();
}

// The union of the lit marks' bounds — what a caller scrolls to, or draws a focus ring around.
export function highlightBounds(highlight: FindingHighlight): BBox | null {
  if (highlight.elements.length === 0) return null;
  return highlight.elements.reduce<BBox>((acc, el) => ({
    left: Math.min(acc.left, el.bbox.left),
    top: Math.min(acc.top, el.bbox.top),
    right: Math.max(acc.right, el.bbox.right),
    bottom: Math.max(acc.bottom, el.bbox.bottom),
  }), { ...highlight.elements[0]!.bbox });
}

// Scene point -> canvas CSS point, for anchoring a DOM tooltip to a lit mark.
export const sceneToScreen = (p: Pt, v: View): Pt => ({ x: p.x * v.s + v.tx, y: p.y * v.s + v.ty });

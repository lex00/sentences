// The engine's public API — the single import surface for any app built on this project (the
// display demo, and future game modes). Apps import from "./engine.js", never from deep paths, so
// the seam is explicit and the internals stay free to move.
//
// This barrel is the PURE diagramming engine: text/bracket -> IR -> layout -> Scene, plus the
// derived views (inspect, svg, collisions) and the theme. It has no DOM dependency and no game
// state. Two things are deliberately NOT here:
//   - the neural parser (ModelParser) — import "./parser/model-parser.js" directly; it pulls in
//     onnxruntime, so a model-free app (e.g. a content-bank game) stays lean by not touching it.
//   - the effects/animation + renderers (anim, scheduler, canvas/webgpu) — a separate presentation
//     layer an app opts into.
//
// The IR (ir.ts) is the contract: it is both the diagram's source of truth and a game's answer key.

// --- pipeline: bracket/tree -> IR -> layout -> Scene ---
export { parseBracket, phrase } from "./ptb.js";
export { lower, lowerSentence, lowerNBest } from "./lower.js";
export { layout, CanvasTextMetrics, wordNominal } from "./layout.js";

// --- derived views over a Scene ---
export { describeAt, describeAll } from "./inspect.js"; // name the element under a point; enumerate all elements + roles + geometry
export { sceneToSvg } from "./svg.js";
export { collisions } from "./collisions.js"; // geometric overlap oracle / well-formedness check

// --- scene helpers + fit-to-canvas transform (shared by renderers and pointer hit-testing) ---
export { isNode, emptyBBox, fitView, screenToScene } from "./scene.js";

// --- theme (role -> appearance) and the geometric layout style ---
export { defaultTheme, blueprintTheme, defaultLayoutStyle } from "./theme.js";

// --- types ---
export type { Tree } from "./ptb.js";
export type {
  Word, Subject, Predicate, PredicatePart, Clause, Nominal, Verbal,
  Infinitive, Gerund, Complement, Modifier, Compound, Sentence,
} from "./ir.js";
export type { TextMetrics, Measured } from "./layout.js";
export type { Scene, SceneNode, Prim, Role, NodeRole, NodeId, IrId, BBox, Pt, View } from "./scene.js";
export type { Inspection, SceneElement, WordElement, LineElement } from "./inspect.js";
export type { SvgOptions } from "./svg.js";
export type { Collision } from "./collisions.js";
export type { Theme, LayoutStyle, StrokeSpec, FontSpec, Override, EmphasisState } from "./theme.js";

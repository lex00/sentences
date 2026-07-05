// The engine's public API — the single import surface for any app built on this project (the
// display demo, and future game modes). Apps import from "./engine.js", never from deep paths, so
// the seam is explicit and the internals stay free to move.
//
// This barrel is the diagramming engine: text/bracket -> IR -> layout -> Scene, plus the derived
// views (inspect, svg, collisions), the neural parser, and the theme. It has no DOM dependency and
// no game state. NOT here: the effects/animation + renderers (anim, scheduler, canvas/webgpu) — a
// separate presentation layer an app opts into.
//
// The IR (ir.ts) is the contract: it is both the diagram's source of truth and a game's answer key.
// `analyze()` + ModelParser are the game-facing path: parse a player's sentence and read its roles.
// (Importing the barrel does not bundle onnxruntime unless ModelParser/analyze's model is used.)
// --- pipeline: bracket/tree -> IR -> layout -> Scene ---
export { parseBracket, phrase, posTags } from "./ptb.js";
export { lower, lowerSentence, lowerNBest } from "./lower.js";
export { layout, CanvasTextMetrics, wordNominal } from "./layout.js";
// --- neural parser + the game-facing "parse a player's sentence, read its roles" call ---
export { ModelParser, tokenizeWords } from "./parser/model-parser.js";
export { analyze, wordSlots } from "./analyze.js";
// --- derived views over a Scene ---
export { describeAt, describeAll } from "./inspect.js"; // name the element under a point; enumerate all elements + roles + geometry
export { sceneToSvg } from "./svg.js";
export { collisions } from "./collisions.js"; // geometric overlap oracle / well-formedness check
// --- scene helpers + fit-to-canvas transform (shared by renderers and pointer hit-testing) ---
export { isNode, emptyBBox, fitView, screenToScene } from "./scene.js";
// --- theme (role -> appearance) and the geometric layout style ---
export { defaultTheme, blueprintTheme, defaultLayoutStyle } from "./theme.js";

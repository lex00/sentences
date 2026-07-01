// Scene — the decoupling seam. layout() runs once and produces a Scene;
// every renderer (Canvas now, WebGPU later) consumes the same Scene.
//
// Two rules that make "rich" possible:
//   (a) a tagged scene-*graph*, not a flat list (groups carry role + stable id)
//   (b) primitives carry *roles*, not pixels (Theme maps role -> appearance)
// --- small helpers ---
export const isNode = (c) => c.children !== undefined;
export const emptyBBox = () => ({
    left: Infinity,
    top: Infinity,
    right: -Infinity,
    bottom: -Infinity,
});

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
export const fitView = (b, cssW, cssH, pad = 28) => {
    const bw = Math.max(1, b.right - b.left);
    const bh = Math.max(1, b.bottom - b.top);
    const s = Math.min(1, (cssW - 2 * pad) / bw, (cssH - 2 * pad) / bh);
    return { s, tx: (cssW - bw * s) / 2 - b.left * s, ty: (cssH - bh * s) / 2 - b.top * s };
};
export const screenToScene = (p, v) => ({ x: (p.x - v.tx) / v.s, y: (p.y - v.ty) / v.s });

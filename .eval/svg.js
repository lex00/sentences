// Scene -> SVG. A second consumer of the exact same Scene + Theme the Canvas renderer uses, so a
// downloaded diagram is geometry-identical to what's on screen. Pure (no DOM): the serializer is
// testable in node and drives all appearance through the Theme seam, never grammar.
//
// The scene bounds become the viewBox, so the SVG scales itself — no fit-to-canvas transform.
import { isNode } from "./scene.js";
const XML = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
const esc = (s) => s.replace(/[&<>"]/g, (c) => XML[c]);
const r = (n) => Math.round(n * 100) / 100; // trim float noise in the output
export function sceneToSvg(scene, theme, opts = {}) {
    const pad = opts.pad ?? 24;
    const b = scene.bounds;
    const x = Math.floor(b.left - pad);
    const y = Math.floor(b.top - pad);
    const w = Math.max(1, Math.ceil(b.right - b.left + 2 * pad));
    const h = Math.max(1, Math.ceil(b.bottom - b.top + 2 * pad));
    const body = [];
    if (opts.background)
        body.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${esc(opts.background)}"/>`);
    (function walk(n) {
        for (const c of n.children) {
            if (isNode(c))
                walk(c);
            else {
                const el = primToSvg(c, theme);
                if (el)
                    body.push(el);
            }
        }
    })(scene.root);
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${w} ${h}" width="${w}" height="${h}">\n${body.join("\n")}\n</svg>\n`;
}
function primToSvg(p, theme) {
    if (p.kind === "seg") {
        const s = theme.stroke(p.role);
        const cap = s.cap ? ` stroke-linecap="${s.cap}"` : "";
        const dash = s.dash && s.dash.length ? ` stroke-dasharray="${s.dash.join(",")}"` : "";
        return `<line x1="${r(p.a.x)}" y1="${r(p.a.y)}" x2="${r(p.b.x)}" y2="${r(p.b.y)}" stroke="${s.color}" stroke-width="${s.weight}"${cap}${dash}/>`;
    }
    if (!p.text)
        return null; // empty labels (e.g. an implied-preposition slant) draw nothing
    const f = theme.font(p.role);
    const fill = theme.stroke(p.role).color;
    const deg = r((p.angle * 180) / Math.PI);
    const rot = deg !== 0 ? ` rotate(${deg})` : "";
    const style = f.style && f.style !== "normal" ? ` font-style="${f.style}"` : "";
    const weight = f.weight ? ` font-weight="${f.weight}"` : "";
    // translate to the anchor, then rotate — matching the Canvas renderer's alphabetic baseline.
    return `<text transform="translate(${r(p.anchor.x)},${r(p.anchor.y)})${rot}" font-family="${esc(f.family)}" font-size="${f.size}"${weight}${style} fill="${fill}">${esc(p.text)}</text>`;
}

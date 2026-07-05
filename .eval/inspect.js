// Inspector — read a laid-out Scene and describe its parts by grammatical role. Two entry points
// over one walk:
//   describeAll(scene) -> every word and line, with role + geometry + owning node id. The
//     game-agnostic "truth" layer: an "identify the type" mode picks quiz targets from it; a
//     "drag the words in" or "fill your own words" mode reads word slots (anchor + role) from it.
//   describeAt(scene, point) -> the single element under a point (hover tooltips).
// Pure and renderer-agnostic: role comes from each element's own role plus its ancestor node roles.
import { isNode } from "./scene.js";
// What each grammatical slot means, keyed by the node role a word sits in.
const ROLE = {
    subject: { name: "Subject", detail: "The noun or pronoun the sentence is about." },
    verb: { name: "Verb", detail: "The predicate — the action or state, right of the subject divider." },
    object: { name: "Direct object", detail: "Receives the action of the verb, after the verb–object divider." },
    complement: { name: "Complement", detail: "A predicate noun/adjective or an objective complement." },
    modifier: { name: "Modifier", detail: "An adjective, adverb, or article, on a slant under the word it modifies." },
    pp: { name: "Prepositional phrase", detail: "A preposition on the slant, its object on the line below." },
    subclause: { name: "Subordinate clause", detail: "A clause used as a modifier or noun, on a dotted connector." },
    compound: { name: "Compound", detail: "Coordinated parts joined by a conjunction on a fork." },
    clause: { name: "Clause", detail: "A subject–predicate unit." },
    sentence: { name: "Sentence", detail: "The whole diagram." },
};
// What each line means, keyed by the segment role (slant refined by context below).
const LINE = {
    baseline: { name: "Baseline", detail: "The horizontal line the words sit on." },
    rail: { name: "Rail", detail: "A supporting horizontal line (a stand or a raised platform)." },
    "divider.full": { name: "Subject | Predicate divider", detail: "The full vertical bar splitting subject from verb." },
    "divider.half": { name: "Verb | Object divider", detail: "The half bar before a direct object." },
    "divider.lean": { name: "Complement divider", detail: "The back-slanting line before a predicate noun/adjective or objective complement." },
    slant: { name: "Modifier line", detail: "Slants down from a word to the modifier hanging on it." },
    word: { name: "Word", detail: "A diagrammed word." },
    "connector.dotted": { name: "Connector", detail: "Links a subordinate/relative clause or a conjunction." },
    fork: { name: "Fork", detail: "Joins the coordinated parts of a compound." },
};
const PREP_LINE = { name: "Preposition line", detail: "Carries the preposition; its object sits on the line at the foot." };
const nearestRole = (chain) => {
    for (let i = chain.length - 1; i >= 0; i--)
        if (ROLE[chain[i]])
            return chain[i];
    return "sentence";
};
function wordCorners(anchor, angle, width, ascent, descent) {
    const c = Math.cos(angle), s = Math.sin(angle);
    const local = [[0, -ascent], [width, -ascent], [width, descent], [0, descent]];
    return local.map(([lx, ly]) => ({ x: anchor.x + lx * c - ly * s, y: anchor.y + lx * s + ly * c }));
}
const aabb = (pts) => ({
    left: Math.min(...pts.map((p) => p.x)),
    top: Math.min(...pts.map((p) => p.y)),
    right: Math.max(...pts.map((p) => p.x)),
    bottom: Math.max(...pts.map((p) => p.y)),
});
function pointInQuad(p, q) {
    let sign = 0;
    for (let i = 0; i < 4; i++) {
        const a = q[i], b = q[(i + 1) % 4];
        const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
        if (cross !== 0) {
            const sg = Math.sign(cross);
            if (sign === 0)
                sign = sg;
            else if (sg !== sign)
                return false;
        }
    }
    return true;
}
function distToSeg(p, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const len2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
// Every word and line in the scene, with its role and geometry.
export function describeAll(scene, m, sizePx) {
    const out = [];
    (function walk(n, roles) {
        const chain = [...roles, n.role];
        for (const c of n.children) {
            if (isNode(c))
                walk(c, chain);
            else if (c.kind === "lbl" && c.text) {
                const rk = nearestRole(chain);
                const r = ROLE[rk];
                const { width, ascent, descent } = m.measure(c.text, sizePx);
                const corners = wordCorners(c.anchor, c.angle, width, ascent, descent);
                out.push({ kind: "word", text: c.text, ...(c.pos ? { pos: c.pos } : {}), role: r.name, roleKey: rk, roles: chain, detail: r.detail, nodeId: n.id, anchor: c.anchor, angle: c.angle, width, bbox: aabb(corners) });
            }
            else if (c.kind === "seg") {
                const r = c.role === "slant" && chain.includes("pp") ? PREP_LINE : LINE[c.role];
                out.push({ kind: "line", role: r.name, roleKey: c.role, roles: chain, detail: r.detail, nodeId: n.id, a: c.a, b: c.b, bbox: aabb([c.a, c.b]) });
            }
        }
    })(scene.root, []);
    return out;
}
// The element under a point (word boxes win over nearby lines). Reuses describeAll's records.
export function describeAt(scene, p, m, sizePx, lineTol = 5) {
    const state = { best: null };
    const consider = (d, el) => { if (!state.best || d < state.best.d)
        state.best = { d, el }; };
    for (const el of describeAll(scene, m, sizePx)) {
        if (el.kind === "word") {
            const { ascent, descent } = m.measure(el.text, sizePx);
            if (pointInQuad(p, wordCorners(el.anchor, el.angle, el.width, ascent, descent)))
                consider(0, el);
        }
        else {
            const d = distToSeg(p, el.a, el.b);
            if (d <= lineTol)
                consider(1 + d, el); // words (d=0) win over lines
        }
    }
    const el = state.best?.el;
    if (!el)
        return null;
    return { title: el.kind === "word" ? `${el.text} · ${el.role}` : el.role, detail: el.detail, kind: el.kind };
}

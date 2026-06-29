// Layout — measure/arrange with a 2-D footprint. The novel, risky core (Phase 3).
// R-K nodes consume space on two interacting axes: horizontal room on the baseline AND a
// diagonal footprint below. Adjacent words' below-clusters can collide independently of
// baseline spacing — which is why constituency-tree layout engines do not transfer.
//
// The whole engine is closed over an injected TextMetrics port + LayoutStyle, so the same
// code serves any backend (canvas measureText in the browser; a stub in tests).

import type { Clause, Nominal, Modifier, Word } from "./ir.js";
import type { Scene, SceneNode, Prim, BBox, Pt, NodeId, NodeRole } from "./scene.js";
import type { LayoutStyle } from "./theme.js";
import { defaultLayoutStyle } from "./theme.js";

// The one genuinely backend-specific concern in layout; inject it as a port.
export interface TextMetrics {
  measure(text: string, sizePx: number): { width: number; ascent: number; descent: number };
}

// Browser adapter — shared by every renderer (same fonts -> same coordinates).
export class CanvasTextMetrics implements TextMetrics {
  private g: CanvasRenderingContext2D;
  constructor(private family = "ui-serif, Georgia, 'Times New Roman', serif") {
    const c = document.createElement("canvas");
    const ctx = c.getContext("2d");
    if (!ctx) throw new Error("2D canvas context unavailable for text metrics");
    this.g = ctx;
  }
  measure(text: string, sizePx: number) {
    this.g.font = `${sizePx}px ${this.family}`;
    const m = this.g.measureText(text);
    return {
      width: m.width,
      ascent: m.actualBoundingBoxAscent ?? sizePx * 0.8,
      descent: m.actualBoundingBoxDescent ?? sizePx * 0.2,
    };
  }
}

// measure() result: horizontal room on the rail + the below-cluster bbox (relative to the
// head's left anchor at (0,0), baseline y=0) + a closure that emits absolute geometry.
export type Measured = {
  width: number; // baselineWidth
  below: BBox; // everything hanging beneath, relative to left anchor
  place: (x: number, y: number, id: NodeId, role: NodeRole, sourceId?: string) => SceneNode;
};

const BASE_Y = 250;
const START_X = 200;

const box = (l: number, t: number, r: number, b: number): BBox => ({ left: l, top: t, right: r, bottom: b });
const unionB = (a: BBox, b: BBox): BBox => ({
  left: Math.min(a.left, b.left),
  top: Math.min(a.top, b.top),
  right: Math.max(a.right, b.right),
  bottom: Math.max(a.bottom, b.bottom),
});

export function layout(ir: Clause, metrics: TextMetrics, style: LayoutStyle = defaultLayoutStyle): Scene {
  const SZ = style.em;
  const w = (t: string) => metrics.measure(t, SZ).width;
  const cos = Math.cos(style.slantAngle);
  const sin = Math.sin(style.slantAngle);

  const lblBox = (anchor: Pt, text: string, angle: number): BBox => {
    const tw = w(text);
    const ex = anchor.x + tw * Math.cos(angle);
    const ey = anchor.y + tw * Math.sin(angle);
    return box(Math.min(anchor.x, ex), Math.min(anchor.y - SZ, ey - SZ), Math.max(anchor.x, ex), Math.max(anchor.y + 2, ey + 2));
  };
  const primBox = (p: Prim): BBox =>
    p.kind === "seg"
      ? box(Math.min(p.a.x, p.b.x), Math.min(p.a.y, p.b.y), Math.max(p.a.x, p.b.x), Math.max(p.a.y, p.b.y))
      : lblBox(p.anchor, p.text, p.angle);
  const childrenBox = (cs: Array<SceneNode | Prim>): BBox =>
    cs.map((c) => ("children" in c ? c.bounds : primBox(c))).reduce(unionB);

  // A modifier hanging below a head, measured relative to its attach point at (0,0).
  type MeasuredMod = { below: BBox; place: (ax: number, by: number, id: NodeId) => SceneNode };

  function measureMod(m: Modifier, idPath: NodeId): MeasuredMod {
    if (m.kind === "word") {
      const text = m.value.text;
      const L = w(text) + style.pad;
      const dx = L * cos;
      const dy = L * sin;
      return {
        below: box(0, 0, dx, dy),
        place: (ax, by, id) => {
          const slant: Prim = { kind: "seg", a: { x: ax, y: by }, b: { x: ax + dx, y: by + dy }, role: "slant" };
          const lbl: Prim = { kind: "lbl", text, anchor: { x: ax + 6 * cos, y: by + 6 * sin }, angle: style.slantAngle, role: "word" };
          const ch: Array<SceneNode | Prim> = [slant, lbl];
          return { id, role: "modifier", children: ch, bounds: childrenBox(ch) };
        },
      };
    }
    if (m.kind === "prep") {
      const prep = m.prep.text;
      const L = w(prep) + style.pad;
      const dx = L * cos;
      const dy = L * sin;
      const obj = measureHead(m.object.head.text, m.object.modifiers, `${idPath}/obj`); // recursion
      const objBelow = box(dx + obj.below.left, dy + obj.below.top, dx + obj.below.right, dy + obj.below.bottom);
      return {
        below: unionB(box(0, 0, dx, dy), objBelow),
        place: (ax, by, id) => {
          const P = { x: ax + dx, y: by + dy };
          const slant: Prim = { kind: "seg", a: { x: ax, y: by }, b: P, role: "slant" };
          const prepLbl: Prim = { kind: "lbl", text: prep, anchor: { x: ax + 6 * cos, y: by + 6 * sin }, angle: style.slantAngle, role: "word" };
          const objNode = obj.place(P.x, P.y, `${id}/obj`, "object");
          const ch: Array<SceneNode | Prim> = [slant, prepLbl, objNode];
          return { id, role: "pp", children: ch, bounds: childrenBox(ch) };
        },
      };
    }
    // relative/subordinate clause modifier — full support deferred to Phase 4
    const text = "[clause]";
    const L = w(text) + style.pad;
    return {
      below: box(0, 0, L * cos, L * sin),
      place: (ax, by, id) => {
        const lbl: Prim = { kind: "lbl", text, anchor: { x: ax, y: by + SZ }, angle: 0, role: "word" };
        return { id, role: "subclause", children: [lbl], bounds: primBox(lbl) };
      },
    };
  }

  // A head word + its hanging modifiers, occupying [x, x+width] on the baseline.
  function measureHead(headText: string, mods: Modifier[], idPath: NodeId): Measured {
    const headW = w(headText);
    const mm = mods.map((m, i) => ({ i, m: measureMod(m, `${idPath}/m${i}`) }));
    const segW = Math.max(headW, mods.length * style.minSlantSpacing) + style.pad;
    const attachX = (i: number) => style.pad + i * style.minSlantSpacing;

    let below = box(0, 0, segW, 0); // baseline segment, no overhang until a modifier adds it
    for (const { i, m } of mm) {
      const ax = attachX(i);
      below = unionB(below, box(ax + m.below.left, m.below.top, ax + m.below.right, m.below.bottom));
    }

    return {
      width: segW,
      below,
      place: (x, y, id, role, sourceId) => {
        const rail: Prim = { kind: "seg", a: { x, y }, b: { x: x + segW, y }, role: "baseline" };
        const headLbl: Prim = { kind: "lbl", text: headText, anchor: { x: x + segW / 2 - headW / 2, y: y - 4 }, angle: 0, role: "word" };
        const modNodes = mm.map(({ i, m }) => m.place(x + attachX(i), y, `${id}/m${i}`));
        const ch: Array<SceneNode | Prim> = [rail, headLbl, ...modNodes];
        const node: SceneNode = { id, role, children: ch, bounds: childrenBox(ch) };
        if (sourceId !== undefined) node.sourceId = sourceId;
        return node;
      },
    };
  }

  type CompM = { divider: "half" | "lean"; measured: Measured; id: NodeId; role: NodeRole };
  function measureComplement(c: NonNullable<Clause["complement"]>): CompM {
    if (c.kind === "directObject")
      return { divider: "half", measured: measureHead(c.value.head.text, c.value.modifiers, "c/obj"), id: "c/obj", role: "object" };
    if (c.kind === "predicateNoun")
      return { divider: "lean", measured: measureHead(c.value.head.text, c.value.modifiers, "c/pn"), id: "c/pn", role: "complement" };
    return { divider: "lean", measured: measureHead(c.value.text, [], "c/pa"), id: "c/pa", role: "complement" };
  }

  // --- arrange: place left-to-right applying the non-overlap rule ---
  const Y = BASE_Y;
  const MARGIN = style.pad;

  const subj = measureHead(ir.subject.head.text, ir.subject.modifiers, "c/subj");
  const verb = measureHead(ir.verb.head.text, ir.verb.modifiers, "c/verb");
  const comp = ir.complement ? measureComplement(ir.complement) : null;

  const subjNode = subj.place(START_X, Y, "c/subj", "subject");
  const subjRight = START_X + subj.width;
  const subjClusterR = START_X + subj.below.right;

  // THE CRUX: spacing to the verb respects both the divider minimum AND below-cluster overlap.
  const verbLeft = Math.max(subjRight + style.dividerGap, subjClusterR + MARGIN - verb.below.left);
  const fullX = (subjRight + verbLeft) / 2;
  const fullDiv: Prim = {
    kind: "seg",
    a: { x: fullX, y: Y - style.fullDividerRise },
    b: { x: fullX, y: Y + style.fullDividerRise },
    role: "divider.full",
  };
  const verbNode = verb.place(verbLeft, Y, "c/verb", "verb");
  const verbRight = verbLeft + verb.width;

  const children: Array<SceneNode | Prim> = [subjNode, fullDiv, verbNode];

  if (comp) {
    const verbClusterR = verbLeft + verb.below.right;
    const compLeft = Math.max(verbRight + style.dividerGap, verbClusterR + MARGIN - comp.measured.below.left);
    const dx = (verbRight + compLeft) / 2;
    if (comp.divider === "half") {
      children.push({ kind: "seg", a: { x: dx, y: Y - style.halfDividerRise }, b: { x: dx, y: Y }, role: "divider.half" });
    } else {
      const len = style.halfDividerRise / Math.sin(style.leanLeftAngle);
      children.push({
        kind: "seg",
        a: { x: dx, y: Y },
        b: { x: dx - len * Math.cos(style.leanLeftAngle), y: Y - len * Math.sin(style.leanLeftAngle) },
        role: "divider.lean",
      });
    }
    children.push(comp.measured.place(compLeft, Y, comp.id, comp.role));
  }

  const root: SceneNode = { id: "c", role: "clause", children, bounds: childrenBox(children) };
  return { root, bounds: root.bounds };
}

// Convenience: a Word -> single-word Nominal (used when lowering predicate adjectives, etc.)
export const wordNominal = (word: Word): Nominal => ({ head: word, modifiers: [] });

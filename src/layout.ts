// Layout — measure/arrange with a 2-D footprint. The novel, risky core (Phase 3), extended
// in Phase 4 with compounds (forks) and subordinate clauses (nesting).
//
// Key Phase-4 refactor: clause arrangement is itself a `Measured`, so a clause nests inside a
// clause with no special-casing. Every Measured bakes its id + NodeRole at measure time and
// exposes place(x, y) -> SceneNode. The engine is closed over an injected TextMetrics port.

import type { Clause, Nominal, Verbal, Modifier, Word, Compound, Sentence } from "./ir.js";
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
// left anchor at (0,0), baseline y=0) + a closure that emits absolute geometry. id + role baked.
export type Measured = {
  width: number;
  below: BBox;
  place: (x: number, y: number) => SceneNode;
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

const isCompound = (
  x: Nominal | Verbal | Compound<Nominal> | Compound<Verbal>,
): x is Compound<Nominal | Verbal> => "items" in x;

export function layout(input: Clause | Sentence, metrics: TextMetrics, style: LayoutStyle = defaultLayoutStyle): Scene {
  const SZ = style.em;
  const w = (t: string) => metrics.measure(t, SZ).width;
  const cos = Math.cos(style.slantAngle);
  const sin = Math.sin(style.slantAngle);
  const MARGIN = style.pad;

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

  // --- a modifier hanging below a head, measured relative to its attach point at (0,0) ---
  type MeasuredMod = { below: BBox; place: (ax: number, by: number) => SceneNode };

  function measureMod(m: Modifier, idPath: NodeId): MeasuredMod {
    if (m.kind === "word") {
      const text = m.value.text;
      const L = w(text) + style.pad;
      const dx = L * cos;
      const dy = L * sin;
      return {
        below: box(0, 0, dx, dy),
        place: (ax, by) => {
          const slant: Prim = { kind: "seg", a: { x: ax, y: by }, b: { x: ax + dx, y: by + dy }, role: "slant" };
          const lbl: Prim = { kind: "lbl", text, anchor: { x: ax + 6 * cos, y: by + 6 * sin }, angle: style.slantAngle, role: "word" };
          const ch: Array<SceneNode | Prim> = [slant, lbl];
          return { id: idPath, role: "modifier", children: ch, bounds: childrenBox(ch) };
        },
      };
    }
    if (m.kind === "prep") {
      const prep = m.prep.text;
      const L = w(prep) + style.pad;
      const dx = L * cos;
      const dy = L * sin;
      const obj = measureHead(m.object.head.text, m.object.modifiers, `${idPath}/obj`, "object"); // recursion
      const objBelow = box(dx + obj.below.left, dy + obj.below.top, dx + obj.below.right, dy + obj.below.bottom);
      return {
        below: unionB(box(0, 0, dx, dy), objBelow),
        place: (ax, by) => {
          const P = { x: ax + dx, y: by + dy };
          const slant: Prim = { kind: "seg", a: { x: ax, y: by }, b: P, role: "slant" };
          const prepLbl: Prim = { kind: "lbl", text: prep, anchor: { x: ax + 6 * cos, y: by + 6 * sin }, angle: style.slantAngle, role: "word" };
          const ch: Array<SceneNode | Prim> = [slant, prepLbl, obj.place(P.x, P.y)];
          return { id: idPath, role: "pp", children: ch, bounds: childrenBox(ch) };
        },
      };
    }
    // subordinate / relative clause: nested clause below the head on a dotted connector.
    const nested = measureClause(m.value, `${idPath}/c`, "subclause");
    const conn = m.connector.text;
    const DROP = style.em * 2.6;
    return {
      below: unionB(box(0, 0, 0, DROP), box(nested.below.left, DROP + nested.below.top, Math.max(nested.width, nested.below.right), DROP + nested.below.bottom)),
      place: (ax, by) => {
        const drop: Pt = { x: ax, y: by + DROP };
        const dotted: Prim = { kind: "seg", a: { x: ax, y: by }, b: drop, role: "connector.dotted" };
        const connLbl: Prim = { kind: "lbl", text: conn, anchor: { x: ax + 4, y: by + DROP * 0.5 }, angle: 0, role: "word" };
        const ch: Array<SceneNode | Prim> = [dotted, connLbl, nested.place(ax, by + DROP)];
        return { id: idPath, role: "subclause", children: ch, bounds: childrenBox(ch) };
      },
    };
  }

  // --- a head word + its hanging modifiers, occupying [x, x+width] on the baseline ---
  function measureHead(headText: string, mods: Modifier[], idPath: NodeId, role: NodeRole): Measured {
    const headW = w(headText);
    const mm = mods.map((m, i) => ({ i, m: measureMod(m, `${idPath}/m${i}`) }));
    const segW = Math.max(headW, mods.length * style.minSlantSpacing) + style.pad;
    const attachX = (i: number) => style.pad + i * style.minSlantSpacing;

    let below = box(0, 0, segW, 0);
    for (const { i, m } of mm) {
      const ax = attachX(i);
      below = unionB(below, box(ax + m.below.left, m.below.top, ax + m.below.right, m.below.bottom));
    }

    return {
      width: segW,
      below,
      place: (x, y) => {
        const rail: Prim = { kind: "seg", a: { x, y }, b: { x: x + segW, y }, role: "baseline" };
        const headLbl: Prim = { kind: "lbl", text: headText, anchor: { x: x + segW / 2 - headW / 2, y: y - 4 }, angle: 0, role: "word" };
        const modNodes = mm.map(({ i, m }) => m.place(x + attachX(i), y));
        const ch: Array<SceneNode | Prim> = [rail, headLbl, ...modNodes];
        return { id: idPath, role, children: ch, bounds: childrenBox(ch) };
      },
    };
  }

  // --- a compound head slot: N branches forked to a single apex on the main rail ---
  // openRight=true  -> apex on the right (a SUBJECT connects rightward to the divider).
  // openRight=false -> apex on the left  (an OBJECT/COMPLEMENT/VERB connects leftward to it).
  function measureCompound(branches: Measured[], conj: string, idPath: NodeId, openRight: boolean): Measured {
    const n = branches.length;
    const SP = style.em * 2.2; // vertical gap between adjacent branches
    const offAt = (i: number) => (i - (n - 1) / 2) * SP;
    const maxW = Math.max(...branches.map((b) => b.width));
    const forkLen = style.em * 1.6;
    const width = maxW + forkLen;
    const bx0 = openRight ? 0 : forkLen; // branch baseline left offset

    let below = box(0, offAt(0), width, offAt(n - 1));
    branches.forEach((b, i) => {
      const off = offAt(i);
      below = unionB(below, box(bx0 + b.below.left, off + b.below.top, bx0 + b.below.right, off + b.below.bottom));
    });

    return {
      width,
      below,
      place: (x, y) => {
        const apex: Pt = openRight ? { x: x + width, y } : { x, y };
        const ch: Array<SceneNode | Prim> = [];
        branches.forEach((b, i) => {
          const by = y + offAt(i);
          ch.push(b.place(x + bx0, by));
          const connect: Pt = openRight ? { x: x + bx0 + b.width, y: by } : { x: x + bx0, y: by };
          ch.push({ kind: "seg", a: connect, b: apex, role: "fork" });
        });
        const bx = x + bx0 + (openRight ? maxW : 0); // dotted conjunction bridge near the fork
        ch.push({ kind: "seg", a: { x: bx, y: y + offAt(0) }, b: { x: bx, y: y + offAt(n - 1) }, role: "connector.dotted" });
        ch.push({ kind: "lbl", text: conj, anchor: { x: bx + 4, y }, angle: 0, role: "word" });
        return { id: idPath, role: "compound", children: ch, bounds: childrenBox(ch) };
      },
    };
  }

  // --- a head slot that may be single or compound ---
  function measureFiller(slot: Nominal | Verbal | Compound<Nominal> | Compound<Verbal>, idPath: NodeId, role: NodeRole, openRight: boolean): Measured {
    if (isCompound(slot)) {
      const items = slot.items;
      if (items.length === 1) {
        const it = items[0]!;
        return measureHead(it.head.text, it.modifiers, idPath, role);
      }
      const branches = items.map((it, i) => measureHead(it.head.text, it.modifiers, `${idPath}/b${i}`, role));
      return measureCompound(branches, slot.conjunction.text, idPath, openRight);
    }
    return measureHead(slot.head.text, slot.modifiers, idPath, role);
  }

  type CompM = { divider: "half" | "lean"; measured: Measured };
  function measureComplement(c: NonNullable<Clause["complement"]>, idPrefix: NodeId): CompM {
    if (c.kind === "directObject") return { divider: "half", measured: measureFiller(c.value, `${idPrefix}/obj`, "object", false) };
    if (c.kind === "predicateNoun") return { divider: "lean", measured: measureFiller(c.value, `${idPrefix}/pn`, "complement", false) };
    // predicate adjective — single word, or a fork ("tiny and loud")
    if ("items" in c.value) {
      const branches = c.value.items.map((wd, i) => measureHead(wd.text, [], `${idPrefix}/pa/b${i}`, "complement"));
      return { divider: "lean", measured: measureCompound(branches, c.value.conjunction.text, `${idPrefix}/pa`, false) };
    }
    return { divider: "lean", measured: measureHead(c.value.text, [], `${idPrefix}/pa`, "complement") };
  }

  // --- a whole clause as a placeable unit (so clauses nest in clauses) ---
  function measureClause(clause: Clause, idPrefix: NodeId, role: NodeRole): Measured {
    const subj = measureFiller(clause.subject, `${idPrefix}/subj`, "subject", true); // apex right -> divider
    const verb = measureFiller(clause.verb, `${idPrefix}/verb`, "verb", false); // apex left <- divider
    const comp = clause.complement ? measureComplement(clause.complement, idPrefix) : null;

    const subjRight = subj.width;
    // THE CRUX: spacing respects both the divider minimum AND below-cluster overlap.
    const verbLeft = Math.max(subjRight + style.dividerGap, subj.below.right + MARGIN - verb.below.left);
    const fullX = (subjRight + verbLeft) / 2;
    const verbRight = verbLeft + verb.width;

    let compLeft = 0;
    let compDx = 0;
    let totalRight = verbRight;
    if (comp) {
      const verbClusterR = verbLeft + verb.below.right;
      compLeft = Math.max(verbRight + style.dividerGap, verbClusterR + MARGIN - comp.measured.below.left);
      compDx = (verbRight + compLeft) / 2;
      totalRight = compLeft + comp.measured.width;
    }

    let below = unionB(subj.below, box(verbLeft + verb.below.left, verb.below.top, verbLeft + verb.below.right, verb.below.bottom));
    if (comp) below = unionB(below, box(compLeft + comp.measured.below.left, comp.measured.below.top, compLeft + comp.measured.below.right, comp.measured.below.bottom));

    return {
      width: totalRight,
      below,
      place: (x, y) => {
        const ch: Array<SceneNode | Prim> = [
          subj.place(x, y),
          { kind: "seg", a: { x: x + fullX, y: y - style.fullDividerRise }, b: { x: x + fullX, y: y + style.fullDividerRise }, role: "divider.full" },
          verb.place(x + verbLeft, y),
        ];
        if (comp) {
          const dx = x + compDx;
          if (comp.divider === "half") {
            ch.push({ kind: "seg", a: { x: dx, y: y - style.halfDividerRise }, b: { x: dx, y }, role: "divider.half" });
          } else {
            const len = style.halfDividerRise / Math.sin(style.leanLeftAngle);
            ch.push({ kind: "seg", a: { x: dx, y }, b: { x: dx - len * Math.cos(style.leanLeftAngle), y: y - len * Math.sin(style.leanLeftAngle) }, role: "divider.lean" });
          }
          ch.push(comp.measured.place(x + compLeft, y));
        }
        return { id: idPrefix, role, children: ch, bounds: childrenBox(ch) };
      },
    };
  }

  const sentence: Sentence = "clauses" in input ? input : { clauses: [input], conjunctions: [] };

  // Single clause: unchanged (root id "c").
  if (sentence.clauses.length <= 1) {
    const root = measureClause(sentence.clauses[0] ?? (input as Clause), "c", "clause").place(START_X, BASE_Y);
    return { root, bounds: root.bounds };
  }

  // Compound sentence: stack the clause diagrams, joined by a dashed step with the conjunction.
  const nodes: SceneNode[] = [];
  const baselineYs: number[] = [];
  let y = BASE_Y - (sentence.clauses.length - 1) * style.em * 3.5;
  sentence.clauses.forEach((clause, i) => {
    const placed = measureClause(clause, `c${i}`, "clause").place(START_X, y);
    nodes.push(placed);
    baselineYs.push(y);
    y = placed.bounds.bottom + style.em * 3.5;
  });

  const extra: Prim[] = [];
  const cx = START_X + style.em * 3;
  for (let i = 0; i < nodes.length - 1; i++) {
    const conj = sentence.conjunctions[i];
    if (!conj) continue; // separate sentences (split input): just stack, no connector
    const y0 = baselineYs[i]!;
    const y1 = baselineYs[i + 1]!;
    extra.push({ kind: "seg", a: { x: cx, y: y0 }, b: { x: cx, y: y1 }, role: "connector.dotted" });
    extra.push({ kind: "lbl", text: conj.text, anchor: { x: cx + 4, y: (y0 + y1) / 2 }, angle: 0, role: "word" });
  }

  const children: Array<SceneNode | Prim> = [...nodes, ...extra];
  const root: SceneNode = { id: "s", role: "sentence", children, bounds: childrenBox(children) };
  return { root, bounds: root.bounds };
}

// Convenience: a Word -> single-word Nominal.
export const wordNominal = (word: Word): Nominal => ({ head: word, modifiers: [] });

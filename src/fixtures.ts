// Phase 1 — handwritten Scene fixtures. These bypass both the parser and layout():
// coordinates come from a deliberately dumb placer below (NOT the real footprint engine,
// which arrives in Phase 3). The point is to give the Animator + Canvas executor real
// geometry to diff and morph, and to lock in STABLE STRUCTURAL ids so morphing works.

import type { Clause } from "./ir.js";
import type { Scene, SceneNode, Prim, BBox, Pt } from "./scene.js";

// ---- IR fixtures -----------------------------------------------------------

// "The small dog barked loudly." (intransitive)
export const irA: Clause = {
  subject: {
    head: { text: "dog" },
    modifiers: [
      { kind: "word", value: { text: "the" } },
      { kind: "word", value: { text: "small" } },
    ],
  },
  verb: { head: { text: "barked" }, modifiers: [{ kind: "word", value: { text: "loudly" } }] },
  complement: null,
};

// "The dog barked softly." — drops "small" (exit), retints the adverb (update), reflows the rail.
export const irB: Clause = {
  subject: { head: { text: "dog" }, modifiers: [{ kind: "word", value: { text: "the" } }] },
  verb: { head: { text: "barked" }, modifiers: [{ kind: "word", value: { text: "softly" } }] },
  complement: null,
};

// ---- fixture-only placement (throwaway; replaced by layout() in Phase 3) ----

const EM = 16;
const charW = (t: string) => t.length * EM * 0.56; // crude monospace-ish estimate
const BASE_Y = 250;
const START_X = 200;
const GAP = 26; // gap at the subject|predicate divider
const RISE = 16; // how far the full divider crosses the baseline
const SPACING = 44; // horizontal room reserved per modifier under a head
const PAD = 10;
const SLANT = Math.PI / 3; // 60deg from horizontal, per defaultLayoutStyle

const union = (boxes: BBox[]): BBox =>
  boxes.reduce(
    (a, b) => ({
      left: Math.min(a.left, b.left),
      top: Math.min(a.top, b.top),
      right: Math.max(a.right, b.right),
      bottom: Math.max(a.bottom, b.bottom),
    }),
    { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity },
  );

const primBox = (p: Prim): BBox => {
  if (p.kind === "seg") {
    return {
      left: Math.min(p.a.x, p.b.x),
      top: Math.min(p.a.y, p.b.y),
      right: Math.max(p.a.x, p.b.x),
      bottom: Math.max(p.a.y, p.b.y),
    };
  }
  const w = charW(p.text);
  return { left: p.anchor.x, top: p.anchor.y - EM, right: p.anchor.x + w, bottom: p.anchor.y + 2 };
};

const nodeBox = (children: Array<SceneNode | Prim>): BBox =>
  union(children.map((c) => ("children" in c ? c.bounds : primBox(c))));

// A head word + its hanging modifier slants, occupying [x0, x0+width] on the baseline.
function placeHead(
  idBase: string,
  head: string,
  mods: string[],
  x0: number,
): { node: Omit<SceneNode, "role">; width: number } {
  const width = Math.max(charW(head), mods.length * SPACING) + PAD;
  const headLbl: Prim = {
    kind: "lbl",
    text: head,
    anchor: { x: x0 + width / 2 - charW(head) / 2, y: BASE_Y - 4 },
    angle: 0,
    role: "word",
  };
  const railSeg: Prim = {
    kind: "seg",
    a: { x: x0, y: BASE_Y },
    b: { x: x0 + width, y: BASE_Y },
    role: "baseline",
  };

  const modNodes: SceneNode[] = mods.map((m, i) => {
    const ax = x0 + PAD + i * SPACING;
    const len = charW(m) + 14;
    const end: Pt = { x: ax + len * Math.cos(SLANT), y: BASE_Y + len * Math.sin(SLANT) };
    const slant: Prim = { kind: "seg", a: { x: ax, y: BASE_Y }, b: end, role: "slant" };
    const lbl: Prim = {
      kind: "lbl",
      text: m,
      anchor: { x: ax + 6 * Math.cos(SLANT), y: BASE_Y + 6 * Math.sin(SLANT) },
      angle: SLANT,
      role: "word",
    };
    const children = [slant, lbl];
    return { id: `${idBase}/m${i}`, role: "modifier", children, bounds: nodeBox(children) };
  });

  const children: Array<SceneNode | Prim> = [railSeg, headLbl, ...modNodes];
  return { node: { id: idBase, children, bounds: nodeBox(children) }, width };
}

// Build a Scene from an intransitive S | V clause. (Complements arrive with real layout.)
export function placeScene(c: Clause): Scene {
  const subjMods = c.subject.modifiers.flatMap((m) => (m.kind === "word" ? [m.value.text] : []));
  const verbMods = c.verb.modifiers.flatMap((m) => (m.kind === "word" ? [m.value.text] : []));

  const subj = placeHead("c/subj", c.subject.head.text, subjMods, START_X);
  const subjNode: SceneNode = { ...subj.node, role: "subject" };

  const dividerX = START_X + subj.width + GAP / 2;
  const divider: Prim = {
    kind: "seg",
    a: { x: dividerX, y: BASE_Y - RISE },
    b: { x: dividerX, y: BASE_Y + RISE },
    role: "divider.full",
  };

  const verbX = START_X + subj.width + GAP;
  const verb = placeHead("c/verb", c.verb.head.text, verbMods, verbX);
  const verbNode: SceneNode = { ...verb.node, role: "verb" };

  const children: Array<SceneNode | Prim> = [subjNode, divider, verbNode];
  const root: SceneNode = { id: "c", role: "clause", children, bounds: nodeBox(children) };
  return { root, bounds: root.bounds };
}

// ---- exported fixtures -----------------------------------------------------

export const sceneA: Scene = placeScene(irA);
export const sceneB: Scene = placeScene(irB);

// The morph pair the Animator (Phase 2) toggles between.
export const morphPair: readonly [Scene, Scene] = [sceneA, sceneB];

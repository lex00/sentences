// Inspector — given a point in scene space, describe the word or line under it. Pure and
// renderer-agnostic: it reads the same Scene the renderer draws, using each element's role plus
// its ancestor node roles (subject / verb / object / …) to name its grammatical function. Powers
// hover tooltips, and is the metadata layer a game's "identify the type" mode would build on.

import type { Scene, SceneNode, Pt, NodeRole, Role } from "./scene.js";
import { isNode } from "./scene.js";
import type { TextMetrics } from "./layout.js";

export type Inspection = { title: string; detail: string; kind: "word" | "line" };

// What each grammatical slot means, keyed by the node role a label sits in.
const ROLE: Partial<Record<NodeRole, { name: string; detail: string }>> = {
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

// What each line means, keyed by the segment role (slant is refined by context below).
const LINE: Record<Role, { name: string; detail: string }> = {
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

const nearestRole = (chain: NodeRole[]): NodeRole => {
  for (let i = chain.length - 1; i >= 0; i--) if (ROLE[chain[i]!]) return chain[i]!;
  return "sentence";
};

function pointInLabel(p: Pt, anchor: Pt, angle: number, width: number, m: TextMetrics, text: string, sizePx: number): boolean {
  const { ascent, descent } = m.measure(text, sizePx);
  const c = Math.cos(angle), s = Math.sin(angle);
  const local: Array<[number, number]> = [[0, -ascent], [width, -ascent], [width, descent], [0, descent]];
  const corners: Pt[] = local.map(([lx, ly]) => ({ x: anchor.x + lx * c - ly * s, y: anchor.y + lx * s + ly * c }));
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = corners[i]!, b = corners[(i + 1) % 4]!;
    const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
    if (cross !== 0) {
      const sg = Math.sign(cross);
      if (sign === 0) sign = sg;
      else if (sg !== sign) return false;
    }
  }
  return true;
}

function distToSeg(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export function describeAt(scene: Scene, p: Pt, m: TextMetrics, sizePx: number, lineTol = 5): Inspection | null {
  const state: { best: { d: number; info: Inspection } | null } = { best: null };
  const consider = (d: number, info: Inspection) => { if (!state.best || d < state.best.d) state.best = { d, info }; };

  (function walk(n: SceneNode, roles: NodeRole[]): void {
    const chain = [...roles, n.role];
    for (const c of n.children) {
      if (isNode(c)) walk(c, chain);
      else if (c.kind === "lbl" && c.text) {
        if (pointInLabel(p, c.anchor, c.angle, m.measure(c.text, sizePx).width, m, c.text, sizePx)) {
          const r = ROLE[nearestRole(chain)]!;
          consider(0, { title: `${c.text} · ${r.name}`, detail: r.detail, kind: "word" }); // words win over lines
        }
      } else if (c.kind === "seg") {
        const d = distToSeg(p, c.a, c.b);
        if (d <= lineTol) {
          let line = LINE[c.role];
          if (c.role === "slant" && chain.includes("pp")) line = { name: "Preposition line", detail: "Carries the preposition; its object sits on the line at the foot." };
          consider(1 + d, { title: line.name, detail: line.detail, kind: "line" });
        }
      }
    }
  })(scene.root, []);

  return state.best?.info ?? null;
}

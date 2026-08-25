// diagram-the-finding, part 1 of 2: the SELECTION half (#26). Pure — no canvas, no DOM, no theme.
// Given a DocAnalysis and one Finding, it answers two questions:
//
//   1. can this finding be drawn at all?   (a lexical tell inside a lowered sentence: yes.
//      an em-dash count over a heading that never parsed: no — there is no diagram to light up.)
//   2. if so, WHICH marks carry the tell?  (for the reframe: both copulas, both complements, the
//      negation. for a tricolon: the fork and its items. otherwise: the words the finding's
//      characters cover.)
//
// The answer is a Scene plus a set of SceneElements to light, so the painting half
// (./diagram-finding.ts) is a for-loop over geometry and nothing else. Splitting it this way is
// what makes the interesting part testable in node: every assertion in
// diagram-finding-map.test.ts runs against stub TextMetrics with no canvas in sight.
//
// --- how elements are identified ---
//
// A SceneElement carries the id of the SceneNode that OWNS it, and those ids are structural paths
// baked by layout() ("c0/verb/m1"), stable across re-layout. Two elements can share a nodeId (a
// rail and the head label sitting on it), so this module pairs the node id with the element's
// index in describeAll order to get a per-element key. Selection below is by node id at the CLAUSE
// level and by NodeRole underneath it, deliberately: mirroring layout's full id vocabulary
// ("/pn" vs "/pa" vs "/oc" for the three complement shapes) would duplicate knowledge that lives
// in layout.ts, whereas the roles those nodes carry are the same in every shape.

import type { Clause, Sentence } from "../ir.js";
import type { Scene, SceneNode, NodeId, NodeRole } from "../scene.js";
import type { SceneElement, WordElement } from "../inspect.js";
import type { TextMetrics } from "../layout.js";
import type { LayoutStyle } from "../theme.js";
import type { DocAnalysis, Finding, Span, UnitAnalysis } from "../lint/types.js";
import { isNode } from "../scene.js";
import { layout } from "../layout.js";
import { describeAll } from "../inspect.js";
import { defaultLayoutStyle } from "../theme.js";
import { overlaps } from "../lint/span.js";

// --- public shapes ---

// How the highlight was chosen. Reported so a caller can label the panel ("the shape of the
// reframe" vs "the word we flagged") and so tests can assert the mapping table was consulted.
export type HighlightStrategy = "reframe" | "compound" | "whole-unit" | "span";

export type FindingHighlight = {
  strategy: HighlightStrategy;
  elements: SceneElement[]; // the marks to light, in describeAll order
  elementIds: string[]; // "<nodeId>#<index>" — one key per lit element, stable within this diagram
  nodeIds: NodeId[]; // the SceneNode ids the highlight was derived from (clause/complement/verb…)
  words: string[]; // the lit word texts, in order — the human-readable form of the set
};

export type FindingDiagram = {
  scene: Scene;
  elements: SceneElement[]; // describeAll over `scene`, in walk order; highlight indexes into this
  highlight: FindingHighlight;
  units: UnitAnalysis[]; // the units that fed the diagram, in document order
  clausePrefixes: string[]; // scene node id prefix per diagrammed clause ("c", or "c0"/"c1"/…)
};

export type BuildResult = { ok: true; diagram: FindingDiagram } | { ok: false; reason: string };

export type BuildOptions = {
  style?: LayoutStyle;
  sizePx?: number; // text size describeAll measures at; defaults to the layout style's em
};

// --- text helpers ---

const TOKEN = /[\p{L}\p{N}]+(?:['‘’ʼ-][\p{L}\p{N}]+)*/gu;
const normalize = (w: string): string => w.toLowerCase().replace(/['‘’ʼ]s$/, "");
const tokensOf = (text: string): string[] => (text.match(TOKEN) ?? []).map(normalize);
const isNegator = (token: string): boolean => token === "not" || /n[''’ʼ]?t$/.test(token);

// --- scene walking ---

const elementId = (el: SceneElement, index: number): string => `${el.nodeId}#${index}`;

// Elements owned by a node or anything under it. Node ids are "/"-separated paths, so a prefix
// test IS a subtree test — no second walk of the scene needed.
const inSubtree = (el: SceneElement, id: NodeId): boolean => el.nodeId === id || el.nodeId.startsWith(`${id}/`);

// Descendant nodes matching `roles`, without crossing into a nested clause. A relative clause
// hanging off the subject has its own "verb" and "complement" nodes; lighting those as if they
// were the main clause's would point at the wrong words.
function nodesByRole(start: SceneNode, roles: NodeRole[]): SceneNode[] {
  const out: SceneNode[] = [];
  const NESTED: NodeRole[] = ["clause", "subclause"];
  (function walk(n: SceneNode, depth: number): void {
    if (depth > 0 && NESTED.includes(n.role)) return;
    if (depth > 0 && roles.includes(n.role)) out.push(n);
    for (const c of n.children) if (isNode(c)) walk(c, depth + 1);
  })(start, 0);
  return out;
}

function nodeById(scene: Scene, id: NodeId): SceneNode | null {
  const holder: { hit: SceneNode | null } = { hit: null };
  (function walk(n: SceneNode): void {
    if (holder.hit) return;
    if (n.id === id) { holder.hit = n; return; }
    for (const c of n.children) if (isNode(c)) walk(c);
  })(scene.root);
  return holder.hit;
}

const isWord = (el: SceneElement): el is WordElement => el.kind === "word";

// --- copular / negation shape, read off the IR ---
//
// Deliberately NOT imported from lint/ir-query.ts: isCopular there is a rule's predicate (strict
// be-forms, bails on compound predicates) and it takes a Clause, not a scene node. What the
// diagram needs is looser and different — "does this clause have a complement worth pointing at,
// with a be-ish verb" — and a false positive here costs a highlight, not a finding.
const BE_ISH = new Set(["be", "am", "is", "are", "was", "were", "been", "being", "isn't", "aren't", "wasn't", "weren't"]);

function clauseIsCopularish(clause: Clause): boolean {
  if (!("head" in clause.verb)) return false;
  const last = tokensOf(clause.verb.head.text).pop() ?? "";
  const bare = last.replace(/n[''’ʼ]?t$/, "");
  if (!BE_ISH.has(last) && !BE_ISH.has(bare)) return false;
  return clause.complement?.kind === "predicateNoun" || clause.complement?.kind === "predicateAdj";
}

// --- assembling the diagram ---

// A reframe spans two sentences; a tricolon lives in one. Either way the diagram is the clauses of
// every unit the finding's characters touch, stacked the way parseDocument stacks split input:
// one Sentence, `null` conjunctions between units (no connector drawn — they are separate
// sentences), and layout() puts each clause on its own baseline.
const stackedSentence = (clauses: Clause[]): Sentence => ({
  clauses,
  conjunctions: clauses.slice(1).map(() => null),
});

// layout() names a lone clause "c" and stacked clauses "c0", "c1", … — mirrored here so the
// caller can find a given unit's marks by prefix.
const prefixFor = (index: number, total: number): string => (total <= 1 ? "c" : `c${index}`);

export function buildFindingDiagram(
  doc: DocAnalysis,
  finding: Finding,
  metrics: TextMetrics,
  opts: BuildOptions = {},
): BuildResult {
  const touched = doc.units.filter((u) => covers(finding.span, u.span));
  if (touched.length === 0) return { ok: false, reason: "no sentence in the document overlaps this finding" };

  const units = touched.filter((u) => (u.clauses?.length ?? 0) > 0);
  if (units.length === 0) {
    const why = touched.length === 1 ? "that sentence" : "those sentences";
    return { ok: false, reason: `nothing to diagram — ${why} did not parse into a clause (${touched[0]!.outcome})` };
  }

  const clauses: Clause[] = units.flatMap((u) => u.clauses!);
  const style = opts.style ?? defaultLayoutStyle;
  const sizePx = opts.sizePx ?? style.em;

  let scene: Scene;
  try {
    scene = layout(stackedSentence(clauses), metrics, style);
  } catch (err) {
    return { ok: false, reason: `the diagram engine could not lay that out: ${(err as Error).message}` };
  }
  const elements = describeAll(scene, metrics, sizePx);

  // Which clause prefixes belong to which unit, in the order the clauses were concatenated.
  const clausePrefixes = clauses.map((_, i) => prefixFor(i, clauses.length));
  const prefixesByUnit: string[][] = [];
  let at = 0;
  for (const u of units) {
    const n = u.clauses!.length;
    prefixesByUnit.push(clausePrefixes.slice(at, at + n));
    at += n;
  }

  const ctx: SelectContext = { doc, finding, scene, elements, units, clauses, clausePrefixes, prefixesByUnit };
  return { ok: true, diagram: { scene, elements, highlight: selectHighlight(ctx), units, clausePrefixes } };
}

// --- the per-rule mapping table ---

type SelectContext = {
  doc: DocAnalysis;
  finding: Finding;
  scene: Scene;
  elements: SceneElement[];
  units: UnitAnalysis[];
  clauses: Clause[];
  clausePrefixes: string[];
  prefixesByUnit: string[][];
};

type Selector = (ctx: SelectContext) => FindingHighlight | null;

// ruleId (or ruleId prefix, matched longest-first) -> how to pick the marks that carry the tell.
// A selector returning null means "this diagram doesn't have the shape after all" and falls
// through to the span selector, which is always able to answer.
const SELECTORS: Array<[string, Selector]> = [
  ["reframe", selectReframe],
  ["tricolon/", selectCompound],
  ["syntactic/self-posed-question", selectWholeUnits],
  ["repetition/near-duplicate", selectWholeUnits],
];

function selectHighlight(ctx: SelectContext): FindingHighlight {
  const match = SELECTORS.filter(([id]) => ctx.finding.ruleId === id || ctx.finding.ruleId.startsWith(id))
    .sort((a, b) => b[0].length - a[0].length)[0];
  return (match && match[1](ctx)) ?? selectSpan(ctx);
}

// Build a highlight from a predicate over (element, index).
function highlightWhere(ctx: SelectContext, strategy: HighlightStrategy, nodeIds: NodeId[], keep: (el: SceneElement, i: number) => boolean): FindingHighlight {
  const elements: SceneElement[] = [];
  const elementIds: string[] = [];
  ctx.elements.forEach((el, i) => {
    if (!keep(el, i)) return;
    elements.push(el);
    elementIds.push(elementId(el, i));
  });
  return { strategy, nodeIds, elements, elementIds, words: elements.filter(isWord).map((w) => w.text) };
}

// --- reframe: both copulas, both complements, the negation, and the complement dividers ---
//
// "It is not bold. It is backwards." draws as two stacked clauses whose right-hand halves mirror
// each other. Lighting the copula, the lean divider and the complement on BOTH baselines is what
// makes the mirroring visible; lighting the negation is what shows which half does the denying.
function selectReframe(ctx: SelectContext): FindingHighlight | null {
  const nodeIds: NodeId[] = [];
  const lit = new Set<string>(); // element ids

  const mark = (pred: (el: SceneElement) => boolean): void => {
    ctx.elements.forEach((el, i) => { if (pred(el)) lit.add(elementId(el, i)); });
  };

  let copularClauses = 0;
  ctx.clauses.forEach((clause, i) => {
    if (!clauseIsCopularish(clause)) return;
    copularClauses++;
    const prefix = ctx.clausePrefixes[i]!;
    const clauseNode = nodeById(ctx.scene, prefix);
    if (!clauseNode) return;
    nodeIds.push(clauseNode.id);

    // the copula: the head label sitting on the verb rail (the rail itself is left alone, so the
    // highlight reads as a word and not as a re-drawn baseline).
    for (const verb of nodesByRole(clauseNode, ["verb"])) {
      nodeIds.push(verb.id);
      mark((el) => el.kind === "word" && el.nodeId === verb.id);
      // the negation, spelled out ("not" on a slant under the verb) or fused into the head
      // ("isn't"): either way it is a word somewhere in the verb's subtree.
      mark((el) => el.kind === "word" && inSubtree(el, verb.id) && tokensOf(el.text).some(isNegator));
    }

    // the complement — the whole subtree, so "old clothes" lights with its modifiers.
    for (const comp of nodesByRole(clauseNode, ["complement"])) {
      nodeIds.push(comp.id);
      mark((el) => inSubtree(el, comp.id));
    }

    // the back-leaning divider that marks the slot as a predicate noun/adjective. It belongs to
    // the clause node itself, which is why it is picked by role rather than by subtree.
    mark((el) => el.kind === "line" && el.nodeId === clauseNode.id && el.roleKey === "divider.lean");
  });

  // One copular clause is half a reframe — the other half didn't lower (see reframe.ts on the
  // contracted and em-dash shapes), or this is the "not because X, but because Y" variant, which
  // has no copula at all. Neither is worth drawing as "the shape"; the span fallback still
  // underlines the offending words.
  if (copularClauses < 2) return null;

  return highlightWhere(ctx, "reframe", nodeIds, (el, i) => lit.has(elementId(el, i)));
}

// --- tricolon: the fork and everything hanging off it ---
function selectCompound(ctx: SelectContext): FindingHighlight | null {
  const compounds = nodesByRole(ctx.scene.root, ["compound"]);
  if (compounds.length === 0) return null;
  const ids = compounds.map((n) => n.id);
  return highlightWhere(ctx, "compound", ids, (el) => ids.some((id) => inSubtree(el, id)));
}

// --- a whole unit each: the question and its answer, both lit ---
function selectWholeUnits(ctx: SelectContext): FindingHighlight | null {
  const prefixes = ctx.clausePrefixes;
  if (prefixes.length === 0) return null;
  return highlightWhere(ctx, "whole-unit", prefixes, (el) => prefixes.some((p) => inSubtree(el, p)));
}

// --- the fallback: the words whose characters the finding covers ---
//
// Word -> element is done by ORDER, not by string equality: "the trap is the trap" has two
// identical words and only one of them is flagged. Within a unit, the nth source occurrence of a
// word maps to the nth occurrence among that unit's word marks, read left-to-right across the
// diagram — which is source order for the shapes R-K draws flat, and close enough for the rest
// (a modifier hangs below and slightly right of its head). Words the lowering dropped shift the
// count; when an occurrence has no match at all the first one stands in, so a lexical finding
// still points somewhere sensible instead of nowhere.
function selectSpan(ctx: SelectContext): FindingHighlight {
  const lit = new Set<string>();
  const nodeIds: NodeId[] = [];

  ctx.units.forEach((unit, u) => {
    const prefixes = ctx.prefixesByUnit[u] ?? [];
    const indexed = ctx.elements
      .map((el, i) => ({ el, i }))
      .filter(({ el }) => isWord(el) && prefixes.some((p) => inSubtree(el, p)))
      .sort((a, b) => (a.el as WordElement).anchor.x - (b.el as WordElement).anchor.x || (a.el as WordElement).anchor.y - (b.el as WordElement).anchor.y);

    // occurrence key ("bold#0", "bold#1") -> the element carrying it
    const byOccurrence = new Map<string, { el: SceneElement; i: number }>();
    const seen = new Map<string, number>();
    for (const entry of indexed) {
      for (const tok of tokensOf((entry.el as WordElement).text)) {
        const n = seen.get(tok) ?? 0;
        seen.set(tok, n + 1);
        const key = `${tok}#${n}`;
        if (!byOccurrence.has(key)) byOccurrence.set(key, entry);
      }
    }

    const occurrence = new Map<string, number>();
    for (const w of unit.words) {
      const tok = normalize(w.text);
      const n = occurrence.get(tok) ?? 0;
      occurrence.set(tok, n + 1);
      if (!covers(ctx.finding.span, w.span)) continue;
      const hit = byOccurrence.get(`${tok}#${n}`) ?? byOccurrence.get(`${tok}#0`);
      if (!hit) continue;
      lit.add(elementId(hit.el, hit.i));
      if (!nodeIds.includes(hit.el.nodeId)) nodeIds.push(hit.el.nodeId);
    }
  });

  return highlightWhere(ctx, "span", nodeIds, (el, i) => lit.has(elementId(el, i)));
}

// A word counts as flagged when the finding's characters overlap it. A zero-width finding span (a
// rule pointing at a position rather than a range) flags the word it sits inside, since a
// half-open overlap test would match nothing at all.
const covers = (finding: Span, word: Span): boolean =>
  finding.start === finding.end ? word.start <= finding.start && finding.start < word.end : overlaps(finding, word);

// Exported for the painter and for tests that want to talk about one mark.
export { elementId, inSubtree, tokensOf, isNegator, clauseIsCopularish };

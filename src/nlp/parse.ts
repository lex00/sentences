// Rule-based constituency chunker. Tagged tokens -> PTB Tree, which the existing (tested)
// lower() turns into Clause IR. Deliberately a pragmatic subset for the pedagogical domain
// (simple-to-moderate sentences); it degrades gracefully and the UI catches hard failures.
//
// Core idea: an NP's open-class run stops at the first verb-like word, so the boundary between
// subject and predicate falls out of greedy NP parsing rather than needing a separate step.

import type { Tree } from "../ptb.js";
import { tag, type Tagged } from "./tagger.js";
import { VERBS, isCapitalized } from "./lexicon.js";

const leaf = (label: string, word: string): Tree => ({ label, word, children: [] });
const node = (label: string, children: Tree[]): Tree => ({ label, children });

const looksLikeVerb = (t: Tagged): boolean => t.tag === "X" && (VERBS.has(t.lc) || t.lc.endsWith("ing") || t.lc.endsWith("ed"));

function finiteVerbTag(word: string): string {
  const lc = word.toLowerCase();
  const cop: Record<string, string> = { is: "VBZ", are: "VBP", am: "VBP", was: "VBD", were: "VBD", be: "VB", been: "VBN", being: "VBG" };
  const aux: Record<string, string> = { has: "VBZ", have: "VBP", had: "VBD", do: "VBP", does: "VBZ", did: "VBD" };
  return cop[lc] ?? aux[lc] ?? (lc.endsWith("ing") ? "VBG" : lc.endsWith("ed") ? "VBD" : lc.endsWith("s") ? "VBZ" : "VBP");
}

const nounTag = (word: string): string => (isCapitalized(word) ? "NNP" : word.toLowerCase().endsWith("s") ? "NNS" : "NN");

type R = { tree: Tree; next: number } | null;

// determiner/possessive? + (adverb|adjective)* + head noun, OR a bare pronoun.
function parseBaseNP(ts: Tagged[], i: number, end: number): R {
  const kids: Tree[] = [];
  let j = i;
  if (j < end && ts[j]!.tag === "DT") kids.push(leaf("DT", ts[j++]!.word));
  else if (j < end && ts[j]!.tag === "PRP$") kids.push(leaf("PRP$", ts[j++]!.word));

  if (j < end && ts[j]!.tag === "PRP") {
    kids.push(leaf("PRP", ts[j++]!.word));
    return { tree: node("NP", kids), next: j };
  }

  // open-class run: stops at the first verb-like word (that's the predicate boundary)
  const run: Tagged[] = [];
  while (j < end && (ts[j]!.tag === "X" || ts[j]!.tag === "CD" || ts[j]!.tag === "RB") && !looksLikeVerb(ts[j]!)) {
    run.push(ts[j]!);
    j++;
  }
  if (run.length === 0 && kids.length === 0) return null;

  // last open-class word is the head noun; earlier ones are modifiers
  let headIdx = -1;
  for (let k = run.length - 1; k >= 0; k--) if (run[k]!.tag === "X" || run[k]!.tag === "CD") { headIdx = k; break; }
  run.forEach((t, k) => {
    if (k === headIdx) kids.push(leaf(nounTag(t.word), t.word));
    else if (t.tag === "RB") kids.push(leaf("RB", t.word));
    else if (t.tag === "CD") kids.push(leaf("CD", t.word));
    else kids.push(leaf("JJ", t.word)); // pre-head open-class word -> adjective
  });
  if (headIdx === -1 && kids.length === 0) return null;
  return { tree: node("NP", kids), next: j };
}

function parsePP(ts: Tagged[], i: number, end: number): R {
  if (ts[i]!.tag !== "IN") return null;
  const np = parseNP(ts, i + 1, end);
  if (!np) return null;
  return { tree: node("PP", [leaf("IN", ts[i]!.word), np.tree]), next: np.next };
}

// base NP + trailing PPs + coordination (NP CC NP)
function parseNP(ts: Tagged[], i: number, end: number): R {
  const base = parseBaseNP(ts, i, end);
  if (!base) return null;
  let j = base.next;
  const post: Tree[] = [];
  while (j < end && ts[j]!.tag === "IN") {
    const pp = parsePP(ts, j, end);
    if (!pp) break;
    post.push(pp.tree);
    j = pp.next;
  }
  let tree = post.length ? node("NP", [base.tree, ...post]) : base.tree;

  if (j < end && ts[j]!.tag === "CC") {
    const rhs = parseNP(ts, j + 1, end);
    if (rhs) {
      tree = node("NP", [tree, leaf("CC", ts[j]!.word), rhs.tree]);
      j = rhs.next;
    }
  }
  return { tree, next: j };
}

// one predicate: verb chain + complement (object / predicate noun / adjective) + modifiers
function parseSingleVP(ts: Tagged[], i: number, end: number): R {
  const kids: Tree[] = [];
  let j = i;
  let isCop = false;
  while (j < end && (ts[j]!.tag === "MD" || ts[j]!.tag === "AUX" || ts[j]!.tag === "COP" || looksLikeVerb(ts[j]!))) {
    const t = ts[j]!;
    if (t.tag === "COP") isCop = true;
    kids.push(leaf(t.tag === "MD" ? "MD" : finiteVerbTag(t.word), t.word));
    j++;
  }
  if (kids.length === 0) return null;

  while (j < end && ts[j]!.tag !== "CC") {
    const t = ts[j]!;
    if (t.tag === "RB") {
      kids.push(node("ADVP", [leaf("RB", t.word)]));
      j++;
    } else if (t.tag === "IN") {
      const pp = parsePP(ts, j, end);
      if (!pp) break;
      kids.push(pp.tree);
      j = pp.next;
    } else if (t.tag === "SUB") {
      const s = parseS(ts, j + 1, end);
      if (!s) break;
      kids.push(node("SBAR", [leaf("IN", t.word), s.tree]));
      j = s.next;
    } else if (isCop && t.tag === "X" && !looksLikeVerb(t)) {
      // predicate adjective(s): copula + bare open-class word(s), incl. "tiny and loud"
      const adj: Tree[] = [];
      for (;;) {
        if (j < end && ts[j]!.tag === "X" && !looksLikeVerb(ts[j]!)) adj.push(leaf("JJ", ts[j++]!.word));
        else if (j + 1 < end && ts[j]!.tag === "CC" && ts[j + 1]!.tag === "X" && !looksLikeVerb(ts[j + 1]!)) adj.push(leaf("CC", ts[j++]!.word));
        else break;
      }
      kids.push(node("ADJP", adj));
    } else if (t.tag === "DT" || t.tag === "PRP$" || t.tag === "PRP" || (t.tag === "X" && !looksLikeVerb(t)) || t.tag === "CD") {
      const np = parseNP(ts, j, end);
      if (!np) break;
      kids.push(np.tree); // lower() decides object vs predicate-nominative by copula
      j = np.next;
    } else break;
  }
  return { tree: node("VP", kids), next: j };
}

// predicate with optional coordination (VP CC VP)
function parseVP(ts: Tagged[], i: number, end: number): R {
  const first = parseSingleVP(ts, i, end);
  if (!first) return null;
  let j = first.next;
  if (j < end && ts[j]!.tag === "CC") {
    const rhs = parseSingleVP(ts, j + 1, end);
    if (rhs) return { tree: node("VP", [first.tree, leaf("CC", ts[j]!.word), rhs.tree]), next: rhs.next };
  }
  return first;
}

function parseS(ts: Tagged[], i: number, end: number): R {
  const subj = parseNP(ts, i, end);
  if (!subj) return null;
  const vp = parseVP(ts, subj.next, end);
  if (!vp) return null;
  return { tree: node("S", [subj.tree, vp.tree]), next: vp.next };
}

// Parse a sentence into a constituency Tree. Throws if it can't find an S (NP + VP).
export function parse(text: string): Tree {
  const ts = tag(text).filter((t) => t.tag !== "." && t.tag !== ",");
  const s = parseS(ts, 0, ts.length);
  if (!s) throw new Error("couldn't parse: expected a subject and a verb");
  return s.tree;
}

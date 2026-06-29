// CKY chart-decoder — faithful port of benepar's tree_from_scores + uncollapse_unary
// (decode_chart.py). The model is span-factored (tree score = sum of per-span label scores),
// so this greedy CKY is the global optimum, matching benepar's TreeCRF decode.
//
// Input: spanScores[left][right-1] = label logits for the span covering words left..right-1,
// plus a predicted POS tag id per word. Output: a PTB Tree feeding the existing lower().

import type { Tree } from "../ptb.js";

export type ParserVocab = {
  label_from_index: string[]; // 124 labels; index 0 = "" (no constituent); "A::B" = collapsed unary
  tag_from_index: Record<string, string>; // POS tag per index
  force_root_constituent: boolean;
};

const argmax = (a: number[], from = 0): number => {
  let bi = from;
  let bv = -Infinity;
  for (let i = from; i < a.length; i++) if (a[i]! > bv) { bv = a[i]!; bi = i; }
  return bi;
};

export function ckyDecode(spanScores: number[][][], tagIds: number[], words: string[], vocab: ParserVocab): Tree {
  const n = words.length;
  const leaves: Tree[] = words.map((w, i) => ({ label: vocab.tag_from_index[String(tagIds[i])] ?? "X", word: w, children: [] }));

  type Cell = { children: Tree[]; score: number };
  const chart: Cell[][] = Array.from({ length: n + 1 }, () => new Array<Cell>(n + 1));

  for (let length = 1; length <= n; length++) {
    for (let left = 0; left + length <= n; left++) {
      const right = left + length;
      const raw = spanScores[left]![right - 1]!;
      const ls = raw.map((x) => x - raw[0]!); // normalize against the "no label" score
      // force a real label on the whole-sentence root (skip index 0)
      const idx = length < n || !vocab.force_root_constituent ? argmax(ls) : argmax(ls, 1);
      const label = vocab.label_from_index[idx] ?? "";
      const labelScore = ls[idx]!;

      if (length === 1) {
        let tree: Tree = leaves[left]!;
        if (label) tree = { label, children: [tree] };
        chart[left]![right] = { children: [tree], score: labelScore };
        continue;
      }

      let bestSplit = left + 1;
      let bestScore = -Infinity;
      for (let split = left + 1; split < right; split++) {
        const sc = chart[left]![split]!.score + chart[split]![right]!.score;
        if (sc > bestScore) { bestScore = sc; bestSplit = split; }
      }
      const lc = chart[left]![bestSplit]!;
      const rc = chart[bestSplit]![right]!;
      let children = [...lc.children, ...rc.children];
      if (label) children = [{ label, children }];
      chart[left]![right] = { children, score: labelScore + lc.score + rc.score };
    }
  }

  return uncollapse({ label: "TOP", children: chart[0]![n]!.children });
}

// Expand collapsed unary chains ("A::B" -> (A (B ...))). Preterminals (word set) pass through.
function uncollapse(t: Tree): Tree {
  if (t.word !== undefined) return t;
  const labels = t.label.split("::");
  let children = t.children.map(uncollapse);
  for (let i = labels.length - 1; i >= 0; i--) children = [{ label: labels[i]!, children }];
  return children[0]!;
}

// PTB serialization, matching nltk's str() — for validation against the Python reference.
export function treeToString(t: Tree): string {
  return t.word !== undefined ? `(${t.label} ${t.word})` : `(${t.label} ${t.children.map(treeToString).join(" ")})`;
}

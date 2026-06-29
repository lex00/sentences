// Lowering: constituency parse (Penn-Treebank Tree) -> Clause IR. THE BRIDGE — the piece no
// existing tool provides (see RESEARCH.md). Grammar-directed: it reads phrase structure to
// recover subject / predicate / complement, modifiers, PPs, coordination, and subordinate
// clauses. Deliberately a pragmatic subset; unsupported shapes throw a clear error so callers
// (e.g. lowerNBest) can fall back rather than silently mis-diagram.

import type { Clause, Nominal, Verbal, Modifier, Word, Compound, Complement } from "./ir.js";
import { parseBracket, phrase, type Tree } from "./ptb.js";

const w = (text: string): Word => ({ text });

const COPULA = new Set([
  "be", "am", "is", "are", "was", "were", "been", "being",
  "seem", "seems", "seemed", "become", "becomes", "became",
  "feel", "feels", "felt", "look", "looks", "appear", "appears", "remain", "remains",
]);

const NOUN = new Set(["NN", "NNS", "NNP", "NNPS", "PRP"]);
const PREMOD = new Set(["DT", "JJ", "JJR", "JJS", "PRP$", "CD", "POS", "PDT", "RB"]); // RB: e.g. "very" before adj
const isVerb = (label: string) => /^(VB|MD|AUX)/.test(label);
const isCC = (t: Tree) => t.label === "CC";
const isPunct = (t: Tree) => /^[,:.]$/.test(t.label);

// Flatten a compound to a single Nominal where the IR needs one (prep objects, etc.).
const asNominal = (n: Nominal | Compound<Nominal>): Nominal =>
  "items" in n ? { head: w(n.items.map((i) => i.head.text).join(` ${n.conjunction.text} `)), modifiers: [] } : n;

// --- noun phrases ---

function lowerNP(np: Tree): Nominal | Compound<Nominal> {
  if (np.children.some(isCC)) return lowerCoordNP(np);

  // (NP (NP ...) (PP|SBAR ...)+) — a base nominal with trailing post-modifiers
  const first = np.children[0];
  const rest = np.children.slice(1);
  if (first && first.label === "NP" && rest.length > 0 && rest.every((c) => c.label === "PP" || c.label === "SBAR")) {
    const base = asNominal(lowerNP(first));
    for (const c of rest) base.modifiers.push(c.label === "PP" ? lowerPP(c) : lowerSBAR(c));
    return base;
  }

  // flat NP: pre-modifiers, head noun (last noun wins; earlier nouns become noun-adjunct mods)
  const modifiers: Modifier[] = [];
  let head: string | null = null;
  for (const c of np.children) {
    if (c.word !== undefined) {
      if (NOUN.has(c.label)) {
        if (head !== null) modifiers.push({ kind: "word", value: w(head) });
        head = c.word;
      } else if (PREMOD.has(c.label)) {
        modifiers.push({ kind: "word", value: w(c.word) });
      }
    } else if (c.label === "PP") modifiers.push(lowerPP(c));
    else if (c.label === "SBAR") modifiers.push(lowerSBAR(c));
    else if (c.label === "ADJP") modifiers.push({ kind: "word", value: w(phrase(c)) });
  }
  return { head: w(head ?? phrase(np)), modifiers };
}

function lowerCoordNP(np: Tree): Compound<Nominal> {
  const groups: Tree[][] = [[]];
  let conjunction = "and";
  for (const c of np.children) {
    if (isCC(c)) {
      if (c.word) conjunction = c.word;
      groups.push([]);
    } else if (isPunct(c)) {
      groups.push([]);
    } else {
      groups[groups.length - 1]!.push(c);
    }
  }
  const items = groups
    .filter((g) => g.length > 0)
    .map((g) => asNominal(lowerNP(g.length === 1 && g[0]!.label === "NP" ? g[0]! : { label: "NP", children: g })));
  return { items, conjunction: w(conjunction) };
}

// --- prepositional & subordinate ---

function lowerPP(pp: Tree): Modifier {
  const prepTok = pp.children.find((c) => c.label === "IN" || c.label === "TO");
  const objNP = pp.children.find((c) => c.label === "NP");
  return {
    kind: "prep",
    prep: w(prepTok?.word ?? phrase(pp).split(" ")[0] ?? "?"),
    object: asNominal(objNP ? lowerNP(objNP) : { head: w(phrase(pp)), modifiers: [] }),
  };
}

function lowerSBAR(sbar: Tree): Modifier {
  const conn = sbar.children.find((c) => ["IN", "WHNP", "WHADVP", "WHPP", "WDT", "WP"].includes(c.label));
  const s = sbar.children.find((c) => c.label === "S" || c.label === "SINV");
  return {
    kind: "clause",
    connector: w(conn ? phrase(conn) : "that"),
    value: s ? lowerClause(s) : { subject: { head: w("?"), modifiers: [] }, verb: { head: w("?"), modifiers: [] }, complement: null },
  };
}

// --- predicates ---

function lowerPredicate(vp: Tree): { verb: Verbal | Compound<Verbal>; complement: Complement | null } {
  // compound predicate: (VP (VP ...) (CC and) (VP ...))
  const vpKids = vp.children.filter((c) => c.label === "VP");
  if (vp.children.some(isCC) && vpKids.length >= 2) {
    let conjunction = "and";
    for (const c of vp.children) if (isCC(c) && c.word) conjunction = c.word;
    const items = vpKids.map((v) => {
      const r = lowerPredicate(v);
      return "items" in r.verb ? asVerbalFlat(r.verb) : r.verb;
    });
    return { verb: { items, conjunction: w(conjunction) }, complement: null };
  }

  const verbWords: string[] = [];
  const modifiers: Modifier[] = [];
  let complement: Complement | null = null;

  const walk = (node: Tree): void => {
    for (const c of node.children) {
      if (c.word !== undefined && isVerb(c.label)) verbWords.push(c.word);
      else if (c.label === "VP") walk(c); // auxiliary chain: "has been running"
      else if (c.label === "ADVP" || c.label === "RB") modifiers.push({ kind: "word", value: w(phrase(c)) });
      else if (c.label === "PP") modifiers.push(lowerPP(c));
      else if (c.label === "SBAR") modifiers.push(lowerSBAR(c));
      else if (c.label === "NP") {
        const nom = lowerNP(c);
        complement = isCopula(verbWords) ? { kind: "predicateNoun", value: nom } : { kind: "directObject", value: nom };
      } else if (c.label === "ADJP" || c.label === "JJ") {
        complement = { kind: "predicateAdj", value: w(phrase(c)) };
      }
    }
  };
  walk(vp);

  return { verb: { head: w(verbWords.join(" ") || phrase(vp)), modifiers }, complement };
}

const asVerbalFlat = (c: Compound<Verbal>): Verbal => ({ head: w(c.items.map((i) => i.head.text).join(` ${c.conjunction.text} `)), modifiers: [] });
const isCopula = (verbWords: string[]) => verbWords.some((v) => COPULA.has(v.toLowerCase()));

// --- clause ---

function lowerClause(s: Tree): Clause {
  const subjNP = s.children.find((c) => c.label === "NP");
  const vp = s.children.find((c) => c.label === "VP");
  if (!subjNP || !vp) throw new Error(`lower: unsupported clause (need NP + VP) in (${s.label} ...)`);
  const { verb, complement } = lowerPredicate(vp);
  return { subject: lowerNP(subjNP), verb, complement };
}

// --- public API ---

export function lower(parse: Tree | string): Clause {
  return lowerClause(typeof parse === "string" ? parseBracket(parse) : parse);
}

// N-best: lower each candidate parse, dropping any that fail to lower.
export function lowerNBest(parses: Array<Tree | string>): Clause[] {
  const out: Clause[] = [];
  for (const p of parses) {
    try {
      out.push(lower(p));
    } catch {
      /* skip unsupported parse */
    }
  }
  return out;
}

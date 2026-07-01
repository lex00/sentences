// Lowering: constituency parse (Penn-Treebank Tree) -> Clause IR. THE BRIDGE — the piece no
// existing tool provides (see RESEARCH.md). Grammar-directed: it reads phrase structure to
// recover subject / predicate / complement, modifiers, PPs, coordination, and subordinate
// clauses. Deliberately a pragmatic subset; unsupported shapes throw a clear error so callers
// (e.g. lowerNBest) can fall back rather than silently mis-diagram.
//
// ENGLISH-SPECIFIC SEAM (2 of 2). Constituency-shaped and English-tuned (subject = first NP,
// copula list, PTB labels). A future multilingual path adds a SIBLING `dependency -> IR`
// lowering (UD arcs -> subject/object/modifiers); both produce the same Clause IR. Keeping
// the IR the convergence point is what keeps that door open.
import { parseBracket, phrase } from "./ptb.js";
const w = (text) => ({ text });
const COPULA = new Set([
    "be", "am", "is", "are", "was", "were", "been", "being",
    "seem", "seems", "seemed", "become", "becomes", "became",
    "feel", "feels", "felt", "look", "looks", "appear", "appears", "remain", "remains",
]);
const NOUN = new Set(["NN", "NNS", "NNP", "NNPS", "PRP"]);
const PREMOD = new Set(["DT", "JJ", "JJR", "JJS", "PRP$", "CD", "POS", "PDT", "RB"]); // RB: e.g. "very" before adj
const isVerb = (label) => /^(VB|MD|AUX)/.test(label);
const isCC = (t) => t.label === "CC";
const isPunct = (t) => /^[,:.]$/.test(t.label);
// Flatten a compound to a single Nominal where the IR needs one (prep objects, etc.).
const asNominal = (n) => "items" in n ? { head: w(n.items.map((i) => i.head.text).join(` ${n.conjunction.text} `)), modifiers: [] } : n;
// --- noun phrases ---
function lowerNP(np) {
    if (np.children.some(isCC))
        return lowerCoordNP(np);
    // (NP (NP ...) (PP|SBAR ...)+) — a base nominal with trailing post-modifiers
    const first = np.children[0];
    const rest = np.children.slice(1);
    if (first && first.label === "NP" && rest.length > 0 && rest.every((c) => c.label === "PP" || c.label === "SBAR")) {
        const base = asNominal(lowerNP(first));
        for (const c of rest)
            base.modifiers.push(c.label === "PP" ? lowerPP(c) : lowerSBAR(c));
        return base;
    }
    // flat NP: pre-modifiers, head noun (last noun wins; earlier nouns become noun-adjunct mods)
    const modifiers = [];
    let head = null;
    for (const c of np.children) {
        if (c.word !== undefined) {
            if (NOUN.has(c.label)) {
                if (head !== null)
                    modifiers.push({ kind: "word", value: w(head) });
                head = c.word;
            }
            else if (PREMOD.has(c.label)) {
                modifiers.push({ kind: "word", value: w(c.word) });
            }
        }
        else if (c.label === "PP")
            modifiers.push(lowerPP(c));
        else if (c.label === "SBAR")
            modifiers.push(lowerSBAR(c));
        else if (c.label === "ADJP")
            modifiers.push({ kind: "word", value: w(phrase(c)) });
        else if (c.label === "NP" && c.children.some((k) => k.label === "POS")) {
            // possessive noun ("Alicia's hobby"): the whole 's-phrase is a determiner-like slant modifier
            modifiers.push({ kind: "word", value: w(phrase(c).replace(/ (['’]s?)\b/g, "$1")) });
        }
    }
    return { head: w(head ?? phrase(np)), modifiers };
}
function lowerCoordNP(np) {
    const groups = [[]];
    let conjunction = "and";
    for (const c of np.children) {
        if (isCC(c)) {
            if (c.word)
                conjunction = c.word;
            groups.push([]);
        }
        else if (isPunct(c)) {
            groups.push([]);
        }
        else {
            groups[groups.length - 1].push(c);
        }
    }
    const items = groups
        .filter((g) => g.length > 0)
        .map((g) => asNominal(lowerNP(g.length === 1 && g[0].label === "NP" ? g[0] : { label: "NP", children: g })));
    return { items, conjunction: w(conjunction) };
}
// --- prepositional & subordinate ---
function lowerPP(pp) {
    const prepTok = pp.children.find((c) => c.label === "IN" || c.label === "TO");
    const objNP = pp.children.find((c) => c.label === "NP");
    let object;
    if (objNP) {
        object = asNominal(lowerNP(objNP));
    }
    else {
        // object is a clause/gerund ("after leaving Portugal") — use the words AFTER the preposition,
        // not phrase(pp), which would repeat the preposition itself.
        const rest = pp.children.filter((c) => c !== prepTok).map(phrase).join(" ").trim();
        object = { head: w(rest || phrase(pp)), modifiers: [] };
    }
    return { kind: "prep", prep: w(prepTok?.word ?? phrase(pp).split(" ")[0] ?? "?"), object };
}
function lowerSBAR(sbar) {
    const wh = sbar.children.find((c) => ["WHNP", "WHADVP", "WHPP", "WDT", "WP", "WRB"].includes(c.label));
    const inConn = sbar.children.find((c) => c.label === "IN");
    const s = sbar.children.find((c) => c.label === "S" || c.label === "SINV" || c.label === "SQ");
    const fallback = { subject: { head: w("?"), modifiers: [] }, verb: { head: w("?"), modifiers: [] }, complement: null };
    if (!s)
        return { kind: "clause", connector: w(inConn ? phrase(inConn) : wh ? phrase(wh) : "that"), value: fallback };
    // Relative clause: the wh-word is the gapped subject ("the dog that barked"); the dotted
    // connector carries no separate word (the relativizer IS the clause's subject).
    if (wh && !s.children.some((c) => c.label === "NP")) {
        return { kind: "clause", connector: w(""), value: lowerClause(s, { head: w(phrase(wh)), modifiers: [] }) };
    }
    // Adverbial / complement clause ("because dogs barked"): the subordinator is the connector.
    return { kind: "clause", connector: w(inConn ? phrase(inConn) : wh ? phrase(wh) : "that"), value: lowerClause(s) };
}
// --- predicates ---
function lowerPredicate(vp) {
    // compound predicate: (VP (VP ...) (CC and) (VP ...))
    const vpKids = vp.children.filter((c) => c.label === "VP");
    if (vp.children.some(isCC) && vpKids.length >= 2) {
        let conjunction = "and";
        for (const c of vp.children)
            if (isCC(c) && c.word)
                conjunction = c.word;
        const items = vpKids.map((v) => {
            const r = lowerPredicate(v);
            return "items" in r.verb ? asVerbalFlat(r.verb) : r.verb;
        });
        return { verb: { items, conjunction: w(conjunction) }, complement: null };
    }
    const verbWords = [];
    const modifiers = [];
    const objNPs = []; // object NPs in order; two => indirect + direct object
    let indirectObject;
    let complement = null;
    const walk = (node) => {
        for (const c of node.children) {
            if (c.word !== undefined && (isVerb(c.label) || c.label === "TO"))
                verbWords.push(c.word); // incl. infinitive "to"
            else if (c.label === "VP")
                walk(c); // auxiliary chain: "has been running"
            else if (c.label === "S" && !c.children.some((x) => x.label === "NP")) {
                const inner = c.children.find((x) => x.label === "VP"); // subjectless S = infinitive: "has to think about X"
                if (inner)
                    walk(inner);
            }
            else if (c.label === "ADVP" || c.label === "RB")
                modifiers.push({ kind: "word", value: w(phrase(c)) });
            else if (c.label === "PP")
                modifiers.push(lowerPP(c));
            else if (c.label === "SBAR")
                modifiers.push(lowerSBAR(c));
            else if (c.label === "NP")
                objNPs.push(c); // resolved after the walk (copula / IO+DO / DO)
            else if (c.label === "INF") {
                complement = { kind: "directObject", value: lowerInfinitive(c) }; // infinitive object on a stand
            }
            else if (c.label === "ADJP" || c.label === "JJ") {
                const jjs = c.label === "JJ" ? [c] : c.children.filter((k) => k.label === "JJ");
                const cc = c.children.find((k) => k.label === "CC");
                if (jjs.length > 1 && cc) {
                    complement = { kind: "predicateAdj", value: { items: jjs.map((j) => w(j.word ?? phrase(j))), conjunction: w(cc.word ?? "and") } };
                }
                else {
                    complement = { kind: "predicateAdj", value: w(phrase(c)) };
                }
            }
        }
    };
    walk(vp);
    // Resolve object NPs, unless an ADJP/INF already claimed the complement slot (predicate adj /
    // objective complement — the latter is handled separately).
    if (complement === null && objNPs.length) {
        if (isCopula(verbWords)) {
            complement = { kind: "predicateNoun", value: lowerNP(objNPs[objNPs.length - 1]) };
        }
        else if (objNPs.length >= 2) {
            // ditransitive "gave the children homework": first NP is the indirect object.
            indirectObject = asNominal(lowerNP(objNPs[0]));
            complement = { kind: "directObject", value: lowerNP(objNPs[objNPs.length - 1]) };
        }
        else {
            complement = { kind: "directObject", value: lowerNP(objNPs[0]) };
        }
    }
    return { verb: { head: w(verbWords.join(" ") || phrase(vp)), modifiers, ...(indirectObject ? { indirectObject } : {}) }, complement };
}
function lowerInfinitive(inf) {
    const verb = inf.children.find((c) => c.label === "VB");
    const obj = inf.children.find((c) => c.label === "NP");
    const modifiers = [];
    for (const c of inf.children) {
        if (c.label === "ADVP" || c.label === "RB")
            modifiers.push({ kind: "word", value: w(phrase(c)) });
        else if (c.label === "PP")
            modifiers.push(lowerPP(c));
    }
    return { kind: "infinitive", verb: w(verb?.word ?? phrase(inf)), object: obj ? asNominal(lowerNP(obj)) : null, modifiers };
}
const asVerbalFlat = (c) => ({ head: w(c.items.map((i) => i.head.text).join(` ${c.conjunction.text} `)), modifiers: [] });
const isCopula = (verbWords) => verbWords.some((v) => COPULA.has(v.toLowerCase()));
// --- clause ---
function lowerClause(s, fallbackSubject) {
    const subjNP = s.children.find((c) => c.label === "NP");
    const vp = s.children.find((c) => c.label === "VP");
    if (!vp)
        throw new Error(`lower: unsupported clause (no VP) in (${s.label} ...)`);
    const subject = subjNP ? lowerNP(subjNP) : fallbackSubject; // relative clauses have a gapped subject
    if (!subject)
        throw new Error(`lower: unsupported clause (need NP + VP) in (${s.label} ...)`);
    const { verb, complement } = lowerPredicate(vp);
    // Interjections ("Man,", "Wow!") float on a detached line above the diagram, unconnected.
    const detached = s.children.filter((c) => c.label === "INTJ").map((c) => w(phrase(c)));
    return { subject, verb, complement, ...(detached.length ? { detached } : {}) };
}
// Yes/no question: (SQ (VBZ Is) (NP the sky) (ADJP blue)) — un-invert to subject + predicate.
function lowerSQ(sq) {
    const kids = sq.children.filter((c) => c.label !== "." && c.label !== ",");
    const lead = []; // leading auxiliary/verb before the subject
    let i = 0;
    while (i < kids.length && /^(VB|MD|AUX)/.test(kids[i].label))
        lead.push(kids[i++]);
    const subjNP = kids[i]?.label === "NP" ? kids[i] : undefined;
    if (subjNP)
        i++;
    const vp = { label: "VP", children: [...lead, ...kids.slice(i)] }; // synthetic declarative predicate
    const { verb, complement } = lowerPredicate(vp);
    return { subject: subjNP ? lowerNP(subjNP) : { head: w("?"), modifiers: [] }, verb, complement };
}
// Wh-question: (SBARQ (WHNP Who) (SQ ...)). The wh-word is the subject if the SQ has no inverted
// aux+subject ("Who chased the cat"), otherwise the gapped object ("What did the dog eat").
function lowerSBARQ(sbarq) {
    const wh = sbarq.children.find((c) => ["WHNP", "WHADVP", "WHPP"].includes(c.label));
    const sq = sbarq.children.find((c) => c.label === "SQ" || c.label === "S");
    if (!sq) {
        // declarative-order question, often interjection-prefixed: SBARQ holds NP + VP directly
        if (sbarq.children.some((c) => c.label === "VP"))
            return lowerClause(sbarq);
        throw new Error("lower: SBARQ without a clause");
    }
    const whWord = wh ? phrase(wh) : "what";
    const sqKids = sq.children.filter((c) => c.label !== "." && c.label !== ",");
    if (sqKids[0]?.label === "VP") {
        const { verb, complement } = lowerPredicate(sqKids[0]); // wh is the subject
        return { subject: { head: w(whWord), modifiers: [] }, verb, complement };
    }
    const clause = lowerSQ(sq); // inverted; wh is the object
    if (!clause.complement)
        clause.complement = { kind: "directObject", value: { head: w(whWord), modifiers: [] } };
    return clause;
}
// Dispatch a top-level constituent to the right lowering.
function lowerTop(t) {
    if (t.label === "SQ")
        return lowerSQ(t);
    if (t.label === "SBARQ")
        return lowerSBARQ(t);
    // Imperative: a top-level clause with a VP but NO subject constituent at all -> implied "(you)".
    // (A gerund/infinitive/noun-clause subject is an S/SBAR, so those are NOT imperatives.)
    const SUBJECTY = new Set(["NP", "S", "SBAR", "SQ", "SBARQ"]);
    if ((t.label === "S" || t.label === "VP") && t.children.some((c) => c.label === "VP") && !t.children.some((c) => SUBJECTY.has(c.label))) {
        return lowerClause(t, { head: w("(you)"), modifiers: [] });
    }
    return lowerClause(t);
}
// --- public API ---
export function lower(parse) {
    return lowerTop(typeof parse === "string" ? parseBracket(parse) : parse);
}
// Lower a whole sentence: a compound sentence (top-level S with several S children) becomes
// multiple clauses; anything else is a single-clause sentence.
export function lowerSentence(parse) {
    let t = typeof parse === "string" ? parseBracket(parse) : parse;
    // unwrap a ROOT/TOP/S1 wrapper (the neural parser returns a Tree object, not a string)
    while (["ROOT", "TOP", "S1", ""].includes(t.label) && t.children.length === 1 && t.children[0])
        t = t.children[0];
    const sKids = t.children.filter((c) => c.label === "S" || c.label === "SINV");
    if (t.label === "S" && sKids.length >= 2) {
        return { clauses: sKids.map((c) => lowerClause(c)), conjunctions: t.children.filter((c) => c.label === "CC").map((c) => w(c.word ?? "and")) };
    }
    return { clauses: [lowerTop(t)], conjunctions: [] };
}
// N-best: lower each candidate parse, dropping any that fail to lower.
export function lowerNBest(parses) {
    const out = [];
    for (const p of parses) {
        try {
            out.push(lower(p));
        }
        catch {
            /* skip unsupported parse */
        }
    }
    return out;
}

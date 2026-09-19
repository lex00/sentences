// Structural reduction (#51): what could come off this sentence without the baseline moving.
//
// Not a trope check. The linter asks whether prose reads as machine-written; this asks whether a
// sentence is carrying its weight, which is where most overwriting actually lives. The claim is
// narrow and worth keeping in view: the Clause IR knows what is grammatically OPTIONAL and has no
// idea what is worth keeping. So everything here is a candidate, nothing is an instruction, and
// nothing in this module edits anything.
//
// WHY THE DIAGRAM ANSWERS THIS. Reed-Kellogg's drawing rules are a removability ordering — that is
// what the notation was built to teach — and src/ir.ts encodes it:
//
//   unconnected     Clause.detached, Clause.absolutes   drawn floating above, joined to nothing
//   parenthetical   Nominal.appositive                  drawn in parentheses on the baseline
//   below the line  Nominal/Verbal .modifiers           slants, recursive, ranked by depth
//   on the line     subject, verb head, complement      the baseline; never a candidate
//
// A thing the notation draws floating above the sentence, connected to nothing, is the diagram
// saying it is not part of the sentence.
//
// THE OFFSET PROBLEM, and how it is solved here. `Word` is `{ text, pos? }` — the IR carries no
// source offsets at all (rules/ing-tackon.ts says as much where it estimates a position). But a
// finding needs a span. So each candidate's words are collected in order and matched back against
// `UnitAnalysis.words`, which DO carry spans, as a contiguous run.
//
// A candidate whose word run is absent or appears MORE THAN ONCE in its unit is dropped rather
// than guessed at. That is the honest failure: offering a span that might point at the wrong copy
// of a phrase is worse than offering nothing, and `unlocatable` in the result says how often it
// happened so the number is visible instead of silently swallowed.

import type { Clause, Complement, Compound, Gerund, Infinitive, Modifier, Nominal, Predicate, Subject, Verbal, Word } from "../ir.js";
import type { Span, UnitAnalysis, WordSpan } from "./types.js";

export type ReductionBand = "unconnected" | "parenthetical" | "modifier";

export type ReductionCandidate = {
  span: Span; // into the document, via the unit's word spans
  band: ReductionBand;
  depth: number; // 0 for unconnected/parenthetical; 1+ for how far below the baseline a modifier sits
  words: number; // how many words come off with it
  text: string; // the candidate's own words, joined
  kind: Modifier["kind"] | "detached" | "absolute" | "appositive";
};

export type ReductionScan = {
  candidates: ReductionCandidate[]; // deepest first; see compareCandidates
  unlocatable: number; // subtrees whose words could not be matched to a unique run in the unit
};

// --- collecting words out of the IR -----------------------------------------------------------

const isCompound = <T,>(v: unknown): v is Compound<T> =>
  typeof v === "object" && v !== null && "items" in v && "conjunction" in v;

const isClause = (v: unknown): v is Clause =>
  typeof v === "object" && v !== null && "subject" in v && "verb" in v;

const isVerbal = (v: unknown): v is Infinitive | Gerund =>
  typeof v === "object" && v !== null && "kind" in v && ((v as { kind: string }).kind === "infinitive" || (v as { kind: string }).kind === "gerund");

// Every word under a modifier, in the order the IR holds them. Order only has to be internally
// consistent with what the matcher looks for, and the matcher looks for exactly this sequence.
function modifierWords(m: Modifier): Word[] {
  switch (m.kind) {
    case "word":
      return [m.value];
    case "prep":
      return [m.prep, ...nominalWords(m.object)];
    case "clause":
      return [m.connector, ...clauseWords(m.value)];
    case "participle":
      return [m.verb, ...(m.object ? nominalWords(m.object) : []), ...m.modifiers.flatMap(modifierWords)];
  }
}

function nominalWords(n: Nominal): Word[] {
  return [n.head, ...n.modifiers.flatMap(modifierWords), ...(n.appositive ? [n.appositive] : [])];
}

const verbalWords = (v: Verbal): Word[] => [
  v.head,
  ...v.modifiers.flatMap(modifierWords),
  ...(v.indirectObject ? nominalWords(v.indirectObject) : []),
];

const verbalPhraseWords = (v: Infinitive | Gerund): Word[] => [
  v.verb,
  ...(v.object ? nominalWords(v.object) : []),
  ...v.modifiers.flatMap(modifierWords),
];

function subjectWords(s: Subject): Word[] {
  if (isCompound<Nominal>(s)) return [...s.items.flatMap(nominalWords), s.conjunction];
  if (isVerbal(s)) return verbalPhraseWords(s);
  if (isClause(s)) return clauseWords(s);
  return nominalWords(s);
}

function predicateWords(p: Predicate): Word[] {
  if (isCompound<{ verb: Verbal; complement: Complement | null }>(p)) {
    return [...p.items.flatMap((i) => [...verbalWords(i.verb), ...(i.complement ? complementWords(i.complement) : [])]), p.conjunction];
  }
  return verbalWords(p);
}

function complementWords(c: Complement): Word[] {
  switch (c.kind) {
    case "directObject": {
      const v = c.value;
      if (isCompound<Nominal>(v)) return [...v.items.flatMap(nominalWords), v.conjunction];
      if (isVerbal(v)) return verbalPhraseWords(v);
      if (isClause(v)) return clauseWords(v);
      return nominalWords(v);
    }
    case "predicateNoun":
      return isCompound<Nominal>(c.value) ? [...c.value.items.flatMap(nominalWords), c.value.conjunction] : nominalWords(c.value);
    case "predicateAdj":
      return isCompound<Word>(c.value) ? [...c.value.items, c.value.conjunction] : [c.value];
    case "objectComplement": {
      const obj = isCompound<Nominal>(c.object) ? [...c.object.items.flatMap(nominalWords), c.object.conjunction] : nominalWords(c.object);
      const oc = "head" in c.oc ? nominalWords(c.oc) : [c.oc];
      return [...obj, ...oc];
    }
  }
}

function clauseWords(c: Clause): Word[] {
  return [
    ...(c.detached ?? []),
    ...(c.absolutes ?? []).flatMap(nominalWords),
    ...subjectWords(c.subject),
    ...predicateWords(c.verb),
    ...(c.complement ? complementWords(c.complement) : []),
  ];
}

// --- locating a word run in the unit -----------------------------------------------------------

const norm = (s: string): string => s.toLowerCase().replace(/[^\p{L}\p{N}']/gu, "");

// The span of the ONE contiguous window in `words` holding exactly this candidate's words, or null
// when there is no such window or more than one.
//
// Matched as a MULTISET over a fixed-width window rather than as an ordered sequence, because the
// IR's order is not the surface order and cannot be made to be. A Nominal is `{ head, modifiers }`,
// so "the mailman" comes out of the tree head-first while English writes the determiner first, and
// an adverb may sit either side of its verb. Requiring the exact IR order dropped five of eight
// candidates on a single test sentence. Contiguity plus the same words in any arrangement is the
// property that actually holds, and it is still strict: a window has to be the right width and
// contain nothing else.
export function locate(words: readonly WordSpan[], seq: readonly Word[]): Span | null {
  const target = seq.map((w) => norm(w.text)).filter((t) => t !== "");
  if (target.length === 0) return null;

  const want = new Map<string, number>();
  for (const t of target) want.set(t, (want.get(t) ?? 0) + 1);

  const hay = words.map((w) => norm(w.text));
  const sameWords = (from: number): boolean => {
    const have = new Map<string, number>();
    for (let k = from; k < from + target.length; k++) have.set(hay[k]!, (have.get(hay[k]!) ?? 0) + 1);
    if (have.size !== want.size) return false;
    for (const [t, n] of want) if (have.get(t) !== n) return false;
    return true;
  };

  let found: Span | null = null;
  for (let i = 0; i + target.length <= hay.length; i++) {
    if (!sameWords(i)) continue;
    if (found) return null; // ambiguous: two windows hold the same words, so neither is safe
    found = { start: words[i]!.span.start, end: words[i + target.length - 1]!.span.end };
  }
  return found;
}

// --- what is not worth offering -------------------------------------------------------------

// Cutting an article is not a reduction, it is a typo. Determiners and possessives are single-word
// modifiers by the same IR path as adjectives ("tiny", "red"), which ARE worth offering, and
// `Word.pos` is optional on the rule-based path so a DT/JJ test fails closed too often to rely on.
// A small closed list is the honest separator.
const FUNCTION_MODIFIERS = new Set([
  "a", "an", "the",
  "this", "that", "these", "those",
  "my", "your", "his", "her", "its", "our", "their",
  "each", "every", "any", "some", "no", "both", "either", "neither",
]);

const isFunctionModifier = (seq: readonly Word[]): boolean =>
  seq.length === 1 && FUNCTION_MODIFIERS.has(norm(seq[0]!.text));

// A reduction is a PHRASE coming off, not a word. Run against this repository's own documentation,
// dropping the floor to one word produced candidates like "ONNX", "fallback" and "Scene" — single
// content words that happen to sit at depth 2 and carry the sentence's actual subject matter.
// Depth cannot tell those from a spare adverb, and a report that offers 180 candidates of which
// most are wrong is worse than one that offers 30 worth reading.
//
// Single-word modifiers are not unreachable, they just belong to other tiers: an intensifier is
// rules/demo.ts's, a magic adverb is the lexical tier's, and both say something about the WORD
// rather than about the structure holding it.
const MIN_CANDIDATE_WORDS = 2;

// A candidate whose span opens a bracket or a quote it does not close (or closes one it never
// opened) would leave the sentence holding half a pair. The word-multiset matcher can produce such
// a window — it matches on words and is blind to the punctuation between them — and the re-parse
// check does not catch it, because a stray ")" rarely stops a sentence from parsing. Cheap to test
// for, and a cut that leaves "executor)" dangling is wrong however well it parses.
const PAIRS: ReadonlyArray<readonly [string, string]> = [["(", ")"], ["[", "]"], ["{", "}"], ["\u201c", "\u201d"]];

export function isBalanced(text: string): boolean {
  for (const [open, close] of PAIRS) {
    let depth = 0;
    for (const ch of text) {
      if (ch === open) depth++;
      else if (ch === close && --depth < 0) return false;
    }
    if (depth !== 0) return false;
  }
  return (text.match(/"/g) ?? []).length % 2 === 0;
}

// --- restrictive modifiers -----------------------------------------------------------------

// "The parser that runs client-side" identifies WHICH parser and cannot be cut; "The parser, which
// runs client-side" can. A comma immediately before the modifier is the only signal English offers,
// and writers are inconsistent with it, so the test fails CLOSED: no comma, not a candidate.
export function isRestrictive(text: string, span: Span): boolean {
  const before = text.slice(Math.max(0, span.start - 24), span.start);
  return !/[,(—–-]\s*$/.test(before);
}

// --- the scan ----------------------------------------------------------------------------------

type Raw = { seq: Word[]; band: ReductionBand; depth: number; kind: ReductionCandidate["kind"] };

// Every modifier under a nominal/verbal, with the depth it hangs at.
function modifierCandidates(mods: readonly Modifier[], depth: number): Raw[] {
  const out: Raw[] = [];
  for (const m of mods) {
    out.push({ seq: modifierWords(m), band: "modifier", depth, kind: m.kind });
    // Recurse for the modifiers a modifier carries of its own — these hang one level lower.
    if (m.kind === "prep") out.push(...modifierCandidates(m.object.modifiers, depth + 1));
    if (m.kind === "participle") out.push(...modifierCandidates(m.modifiers, depth + 1));
  }
  return out;
}

function nominalCandidates(n: Nominal, depth: number): Raw[] {
  return [
    ...(n.appositive ? [{ seq: [n.appositive], band: "parenthetical" as const, depth: 0, kind: "appositive" as const }] : []),
    ...modifierCandidates(n.modifiers, depth),
  ];
}

// Candidates from one clause. The baseline itself is never offered: subject head, verb head and
// complement head do not appear here at any depth.
function clauseCandidates(c: Clause): Raw[] {
  const out: Raw[] = [];

  for (const w of c.detached ?? []) out.push({ seq: [w], band: "unconnected", depth: 0, kind: "detached" });
  for (const a of c.absolutes ?? []) out.push({ seq: nominalWords(a), band: "unconnected", depth: 0, kind: "absolute" });

  const s = c.subject;
  if (isCompound<Nominal>(s)) for (const item of s.items) out.push(...nominalCandidates(item, 1));
  else if (!isVerbal(s) && !isClause(s)) out.push(...nominalCandidates(s, 1));

  const p = c.verb;
  if (isCompound<{ verb: Verbal; complement: Complement | null }>(p)) {
    for (const part of p.items) out.push(...modifierCandidates(part.verb.modifiers, 1));
  } else {
    out.push(...modifierCandidates(p.modifiers, 1));
  }

  const comp = c.complement;
  if (comp) {
    if (comp.kind === "directObject" && !isCompound(comp.value) && !isVerbal(comp.value) && !isClause(comp.value)) {
      out.push(...nominalCandidates(comp.value, 1));
    } else if (comp.kind === "predicateNoun" && !isCompound<Nominal>(comp.value)) {
      out.push(...nominalCandidates(comp.value, 1));
    }
  }

  return out;
}

// Deepest first, then longest, then by position — the order a reader would work through them, and
// the order a budget should spend in.
export const compareCandidates = (a: ReductionCandidate, b: ReductionCandidate): number =>
  b.depth - a.depth || b.words - a.words || a.span.start - b.span.start;

// What could come off `unit`, given its lowered clauses.
export function scanUnit(text: string, unit: UnitAnalysis): ReductionScan {
  const candidates: ReductionCandidate[] = [];
  let unlocatable = 0;
  const seen = new Set<string>();

  for (const clause of unit.clauses ?? []) {
    for (const raw of clauseCandidates(clause)) {
      if (isFunctionModifier(raw.seq)) continue;
      if (raw.seq.filter((w) => norm(w.text) !== "").length < MIN_CANDIDATE_WORDS) continue;
      const span = locate(unit.words, raw.seq);
      if (!span) {
        unlocatable++;
        continue;
      }
      if (raw.kind === "clause" && isRestrictive(text, span)) continue;
      if (!isBalanced(text.slice(span.start, span.end))) continue;
      const key = `${span.start}:${span.end}`;
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push({
        span,
        band: raw.band,
        depth: raw.depth,
        words: raw.seq.filter((w) => norm(w.text) !== "").length,
        text: text.slice(span.start, span.end),
        kind: raw.kind,
      });
    }
  }

  candidates.sort(compareCandidates);
  return { candidates, unlocatable };
}

// --- the safety check --------------------------------------------------------------------------

// Cut the span, re-parse, and see whether the sentence survived.
//
// This is the check nothing else in the toolchain can offer. A model asked to shorten a sentence
// can only assert that the result reads fine; here the claim is mechanical. A cut is SAFE when the
// reduced text still lowers to a clause and its subject head, verb head and complement head are
// the words they were. Anything else — a predicate that vanished, a subject that changed identity,
// a parse that stopped being a parse — and the candidate is withdrawn.
//
// It doubles as a guard on the parser. A misparse that produces a nonsense candidate usually moves
// the baseline when the candidate is applied, so the same test that catches an over-eager cut
// catches a good share of the cases where the tree was wrong to begin with.

import { readDocument } from "../document.js";
import { complementHead, subjectHead } from "./ir-query.js";

const headKey = (c: Clause): string =>
  [subjectHead(c)?.text ?? "", verbHeadText(c), complementHead(c)?.text ?? ""].map((s) => s.toLowerCase()).join("|");

function verbHeadText(c: Clause): string {
  const p = c.verb;
  if (isCompound<{ verb: Verbal; complement: Complement | null }>(p)) return p.items.map((i) => i.verb.head.text).join("+");
  return p.head.text;
}

// Remove `span` from `text` and close the seam it opens. A deletion that strands a doubled space,
// a comma with nothing after it, or a space in front of punctuation would change the parse for
// reasons that have nothing to do with whether the cut was sound, and the resulting text is shown
// to a reader as what the sentence would become.
//
// Only whitespace and the punctuation left hanging at the edges are touched — the same alphabet
// fix/types.ts allows a "repair" to add or remove. No word is altered, so the result stays a
// subsequence of the author's own words.
export function applyCut(text: string, span: Span): string {
  return (text.slice(0, span.start) + text.slice(span.end))
    .replace(/\s+([,.;:!?])/g, "$1") // space pushed up against punctuation
    .replace(/,\s*([.;:!?])/g, "$1") // a comma orphaned in front of the terminator
    .replace(/\(\s*\)/g, "") // an aside emptied of its contents
    .replace(/\s{2,}/g, " ")
    .replace(/[ \t]*,[ \t]*$/gm, "") // a trailing comma with nothing left to join
    .replace(/[ \t]+$/gm, "")
    .trim();
}

export type CutVerdict = { safe: true; reduced: string } | { safe: false; reason: string };

// Whether cutting `span` out of `unitText` leaves the baseline where it was.
export function checkCut(unitText: string, before: Clause, span: Span, unitStart = 0): CutVerdict {
  const local: Span = { start: span.start - unitStart, end: span.end - unitStart };
  if (local.start < 0 || local.end > unitText.length || local.start >= local.end) {
    return { safe: false, reason: "the candidate's span does not sit inside its unit" };
  }

  const reduced = applyCut(unitText, local);
  const units = readDocument(reduced);
  const lowered = units.flatMap((u) => u.clauses ?? []);
  if (lowered.length === 0) {
    return { safe: false, reason: "what is left does not parse as a clause" };
  }
  if (units.length !== 1) {
    return { safe: false, reason: `the cut split one sentence into ${units.length}` };
  }

  const wanted = headKey(before);
  if (!lowered.some((c) => headKey(c) === wanted)) {
    return { safe: false, reason: `the baseline moved (was ${wanted.split("|").filter(Boolean).join(" / ")})` };
  }
  return { safe: true, reduced };
}

// --- the dial, and the document-level entry point ----------------------------------------------

// Reduction's own dial, deliberately NOT lint/strictness.ts. Strictness answers "how readily do I
// call something a tell"; this answers "how deep do I cut". They are orthogonal — an editor may
// well want strict trope detection and conservative cutting — so they are separate parameters that
// happen to share a numeric 1-3 shape for consistency.
export const REDUCTION_LEVELS = [1, 2, 3] as const;
export type ReductionLevel = (typeof REDUCTION_LEVELS)[number];
export const DEFAULT_REDUCTION_LEVEL: ReductionLevel = 2;

export const isReductionLevel = (n: unknown): n is ReductionLevel =>
  REDUCTION_LEVELS.includes(n as ReductionLevel);

// Which candidates a level is willing to offer.
//
//   1  unconnected and parenthetical only. The notation draws these floating above the sentence or
//      inside parentheses; cutting them is as close to free as this gets.
//   2  the above, plus modifiers of modifiers. A phrase two levels off the baseline is decorating
//      decoration.
//   3  the above, plus any adjunct hanging directly off the baseline.
export function offeredAt(c: ReductionCandidate, level: ReductionLevel): boolean {
  if (c.band !== "modifier") return true; // unconnected and parenthetical are offered at every level
  if (level === 1) return false;
  return level === 3 ? c.depth >= 1 : c.depth >= 2;
}

export type DocumentReduction = {
  level: ReductionLevel;
  candidates: ReductionCandidate[]; // safe, offered at this level, deepest first
  words: number; // total words the candidates would remove
  unlocatable: number;
  refused: number; // candidates withdrawn because the cut moved the baseline
};

// Everything that could come off this document, checked and ranked. Report-only: nothing is
// applied, and the caller decides what — if anything — is worth losing.
export function reduceDocument(
  text: string,
  units: readonly UnitAnalysis[],
  level: ReductionLevel = DEFAULT_REDUCTION_LEVEL,
): DocumentReduction {
  const candidates: ReductionCandidate[] = [];
  let unlocatable = 0;
  let refused = 0;

  for (const unit of units) {
    const clause = (unit.clauses ?? [])[0];
    if (!clause) continue;
    const scan = scanUnit(text, unit);
    unlocatable += scan.unlocatable;
    for (const c of scan.candidates) {
      if (!offeredAt(c, level)) continue;
      if (!checkCut(unit.unit, clause, c.span, unit.span.start).safe) {
        refused++;
        continue;
      }
      candidates.push(c);
    }
  }

  candidates.sort(compareCandidates);
  return { level, candidates, words: candidates.reduce((n, c) => n + c.words, 0), unlocatable, refused };
}

// A budget: take candidates deepest-first until the document would reach `targetWords`, skipping
// any that overlap one already taken (cutting a phrase and something inside it is one cut, counted
// twice). Returns what it would take and what it could not reach without touching the baseline.
export function budget(reduction: DocumentReduction, currentWords: number, targetWords: number) {
  const taken: ReductionCandidate[] = [];
  let words = currentWords;
  for (const c of reduction.candidates) {
    if (words <= targetWords) break;
    if (taken.some((t) => c.span.start < t.span.end && t.span.start < c.span.end)) continue;
    taken.push(c);
    words -= c.words;
  }
  return { taken, words, reached: words <= targetWords };
}

// How many words the candidates would actually remove.
//
// NOT the sum of their word counts. The list is a tree flattened: "in the yard" is reported in its
// own right AND as part of "at the mailman in the yard", and adding those gives nine words removed
// from a twelve-word sentence that only has six to give. Overlapping spans are merged first, so the
// number answers "how much shorter would this get" rather than "how many candidates are there".
export function coveredWords(text: string, candidates: readonly ReductionCandidate[]): number {
  if (candidates.length === 0) return 0;
  const sorted = [...candidates].map((c) => c.span).sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: Span[] = [{ ...sorted[0]! }];
  for (const s of sorted.slice(1)) {
    const last = merged[merged.length - 1]!;
    if (s.start <= last.end) last.end = Math.max(last.end, s.end);
    else merged.push({ ...s });
  }
  return merged.reduce((n, m) => n + (text.slice(m.start, m.end).match(/[\p{L}\p{N}]+/gu) ?? []).length, 0);
}

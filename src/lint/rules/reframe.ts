// NEGATIVE PARALLELISM — "It's not X. It's Y." (#14). The most-identified AI tell, detected as a
// SHAPE in the Clause IR rather than as a string pattern, because the string is the least stable
// part of it. "It's not bold — it's backwards", "That isn't boldness. That's backwardness", "The
// question isn't the cost; the question is the timeline" share no substring worth matching, but
// they share one structure:
//
//     clause A: subject + copula + NOT + predicate noun/adjective
//     clause B: the same subject + copula + predicate noun/adjective, affirmative
//     A and B adjacent
//
// That is the whole detector. Everything else here is locating it in the source, deciding how
// loudly to complain, and one extra signal (lexical echo) that sharpens the message.
//
// Density decides severity, not the individual hit. A writer can land this once on purpose; the
// tell is doing it over and over, and only a rule holding the whole document can see that. One
// pair is "low", two "medium", three or more "high" — counted across the document, in one place,
// after every pair has been found.
//
// --- what the parser actually gives us today ---
//
// The rule reads whatever DocAnalysis carries and never re-parses, so what it can catch depends on
// what lowered. On the no-model (rule-based chunker) path, as of this writing:
//
//   two units, uncontracted   "That is not boldness. That is backwardness."   -> two lowered units,
//                             one copular clause each. Caught.
//   semicolon / colon         "The problem was not the code; it was your head." -> the splitter
//                             (src/document.ts) treats ";" and ":" as unit boundaries, so this
//                             arrives as two ADJACENT UNITS and is caught by the same path.
//   contracted                "It's not bold. It's backwards."   -> NOT caught: the rule-based
//                             tagger drops the contracted copula, so the unit comes back a
//                             fragment with no clauses at all (engine bug #31 — not this rule's to
//                             fix). Nothing lowered means nothing to inspect. A model parser, or
//                             #31, makes these work with no change here.
//   em-dash / comma splice    "That is not boldness — it is backwardness."  -> ONE unit, and the
//                             rule-based chunker lowers it to ONE mangled clause (the second half
//                             is folded into the first clause's complement or dropped). So the
//                             dash variant is not caught on that path today. It is not a separate
//                             code path though: when a parser lowers such a unit to two clauses,
//                             the in-unit pass below catches it, which is why "adjacent" means
//                             "consecutive clauses of one unit" as well as "consecutive units".
//
// The "not because X, but because Y" variant is handled separately and deliberately differently:
// see BECAUSE-VARIANT below.
//
// STRICTNESS (strictness.ts). This rule already fires on a single instance, so the dial moves its
// SEVERITY rather than unlocking anything: one step down at level 1, one step up at level 3. At
// level 3 the flagship "one, then two" shapes stop being something the reader weighs against the
// rest of the document and become something the document is simply not allowed to contain.

import type { Clause, Word } from "../../ir.js";
import type { DocAnalysis, Finding, Severity, Span, TropeRule, UnitAnalysis } from "../types.js";
import type { Strictness } from "../strictness.js";
import { DEFAULT_STRICTNESS, severityAt } from "../strictness.js";
import { complementHead, hasAbsoluteAdverb, isCopular, isNegated, subjectHead, subjectIsPronominal } from "../ir-query.js";

const RULE_ID = "reframe";

// --- tokens ---

// Words of a unit, lowercased, possessive stripped ("innovation's" -> "innovation"). Prefers the
// offsets the analysis already mapped; falls back to scanning the unit's own text, because
// UnitAnalysis.words is empty on any path that built units without a word mapping (a bare
// readDocument DocUnit widened into a UnitAnalysis, for one). Only the echo check reads these, so
// the fallback is about not going blind, not about offsets.
const wordRe = /[\p{L}\p{N}]+(?:['‘’ʼ-][\p{L}\p{N}]+)*/gu;
const normalize = (w: string): string => w.toLowerCase().replace(/['‘’ʼ]s$/, "");
const unitTokens = (u: UnitAnalysis): string[] =>
  (u.words.length > 0 ? u.words.map((w) => w.text) : (u.unit.match(wordRe) ?? [])).map(normalize);

// Where the negation sits, for the start of the reported span. "not" as its own word, the
// contraction fused onto the verb ("isn't", "wasn't"), or "never" (#34 — isNegated now covers it
// too, see ir-query.ts, and it never fuses the way "n't" does, so it only ever shows up as its own
// word here). Falls back to the start of the unit when there are no word offsets to point at — a
// span covering the whole unit is still honest, it is just blunter than "starting at the word that
// does the denying".
const isNegator = (w: string): boolean => /^not$/i.test(w) || /n't$/i.test(w) || /^never$/i.test(w);
function negationStart(u: UnitAnalysis): number {
  const hit = u.words.find((w) => isNegator(w.text));
  return hit ? hit.span.start : u.span.start;
}

// --- coreference ---

// The two clauses have to be about the same thing, or this is just two sentences that happen to
// both use "is". Three ways to believe they corefer, in order of how sure we are:
//
//   1. both subjects pronominal/demonstrative — "It … It", "This … That". The referent is thin
//      enough in both that the reader carries it across.
//   2. the same head noun, compared case-insensitively — "The question … The question". No
//      lemmatization: "The questions … The question" does NOT match. Stemming English properly is
//      a dependency this rule will not take, and the plural/singular flip is rare in this pattern
//      (the trope repeats the noun verbatim; that repetition is half of what makes it a tell).
//   3. a full noun phrase answered by a back-referring pronoun — "The problem was not the code; it
//      was your head." Only third-person anaphors count here: "The report was not a summary. I was
//      furious." is two subjects, not one.
//
// Direction matters for arm 3. Full-NP-then-pronoun is anaphora and common; pronoun-then-full-NP
// ("It is not the code. The problem is your head.") is cataphora, much rarer, and much more likely
// to be two genuinely different subjects — so it does not match.
const ANAPHORS = new Set(["it", "this", "that", "they", "these", "those"]);

function corefer(a: Clause, b: Clause): boolean {
  const ha = subjectHead(a), hb = subjectHead(b);
  if (!ha || !hb) return false;
  const pa = subjectIsPronominal(a), pb = subjectIsPronominal(b);
  if (pa && pb) return true;
  if (ha.text.toLowerCase() === hb.text.toLowerCase()) return true;
  return !pa && pb && ANAPHORS.has(hb.text.toLowerCase());
}

// --- the pattern ---

// Denied, then replaced. isCopular carries the complement requirement for both sides: a be-verb
// with nothing predicated of the subject ("It is not here. It is there.") fails it, and so does a
// verb chain that only ends in a be-form by accident ("It is not running. It is walking.").
//
// #34's never/always variant needs no separate predicate here: isNegated now covers "never" too
// (see ir-query.ts), so "It was never bold. It was always safe." already satisfies this — a
// negated (via "never") copular clause followed by an affirmative copular one, same referent. The
// only thing that variant adds on top is a severity bump when "always" is the word making clause B
// affirmative (see strongPair below); a plain affirmative with no "always" still fires here, just
// without the bump ("It was never bold. It was safe.").
const isReframePair = (a: Clause, b: Clause): boolean =>
  isCopular(a) && isNegated(a) && isCopular(b) && !isNegated(b) && corefer(a, b);

// --- ABOUT-VARIANT: "It was never about X. It was always about Y." ---
//
// isCopular requires clause.complement to be a predicateNoun/predicateAdj, but that is not what the
// rule-based lowerer gives a copula followed by a bare prepositional phrase: "It was never about
// the money" lowers with complement: null and "about the money" riding as a "prep" MODIFIER on the
// verb instead (see lower.ts — a PP after a copula with nothing else to attach to falls onto the
// verbal, not the complement slot). isCopular correctly says false for that shape; it just isn't the
// shape this variant is made of, so this is a second, narrower predicate for it: the same be-form
// check as isCopular, without the complement requirement, plus a same-clause "about" prep modifier
// to stand in for the missing complement.
const BE_FORMS = new Set(["be", "am", "is", "are", "was", "were", "been", "being"]);
const lastToken = (text: string): string => (text.trim().split(/\s+/).pop() ?? "").toLowerCase();
function isBeVerb(clause: Clause): boolean {
  if (!("head" in clause.verb)) return false; // compound predicate — no single head to check
  const last = lastToken(clause.verb.head.text);
  return BE_FORMS.has(last) || BE_FORMS.has(last.replace(/n't$/i, ""));
}

function aboutHead(clause: Clause): Word | null {
  if (!("head" in clause.verb)) return null;
  const hit = clause.verb.modifiers.find((m) => m.kind === "prep" && m.prep.text.toLowerCase() === "about");
  return hit && hit.kind === "prep" ? hit.object.head : null;
}

const isAboutPair = (a: Clause, b: Clause): boolean =>
  isBeVerb(a) && isNegated(a) && isBeVerb(b) && !isNegated(b) && aboutHead(a) !== null && aboutHead(b) !== null && corefer(a, b);

// Either shape counts as the reframe: the ordinary predicate-noun/adjective form, or the about-PP
// form the ordinary isCopular can't see.
const isReframePairAny = (a: Clause, b: Clause): boolean => isReframePair(a, b) || isAboutPair(a, b);

// The head naming what was denied/offered, for the message: the ordinary complement, or (when
// isCopular's complement is null) the about-PP's object — whichever the clause actually has.
const pairHead = (c: Clause): Word | null => complementHead(c) ?? aboutHead(c);

// The never/always STRONG bonus (#34): both sides carrying their respective absolute adverb is a
// stronger signal than a bare "never … affirmative" pair, so it earns one severity step up over the
// document's count-scaled severity (see the bump/strong handling in reframeRule.detect below).
const strongPair = (a: Clause, b: Clause): boolean => hasAbsoluteAdverb(a) === "never" && hasAbsoluteAdverb(b) === "always";

// Lexical echo, the bonus signal: clause A's complement head coming back inside clause B — "It is
// not innovation. It is innovation wearing old clothes." The word is denied and then handed back,
// which is the pattern at its most circular, so the message says so.
//
// Counted over the source tokens rather than walked out of the IR, so it survives the words a
// parser dropped. When both clauses live in the SAME unit, one occurrence is clause A's own
// complement — hence the >= 2 threshold there. Short words are skipped: "It is not it" is noise,
// not echo.
const ECHO_MIN_LENGTH = 4;
function echoedWord(a: Clause, unitB: UnitAnalysis, sameUnit: boolean): string | null {
  const head = pairHead(a);
  if (!head) return null;
  const word = normalize(head.text);
  if (word.length < ECHO_MIN_LENGTH) return null;
  const hits = unitTokens(unitB).filter((t) => t === word).length;
  return hits >= (sameUnit ? 2 : 1) ? head.text : null;
}

// --- BECAUSE-VARIANT: "not because X, but because Y" ---
//
// The same reframe with the contrast moved into the reasons. Detected from TOKEN SHAPE, not from
// the IR, and that is a considered choice: the rule-based chunker lowers "He left not because he
// was tired, but because he was bored" to one clause carrying ONE because-modifier — the second
// because-clause is dropped in lowering, so the paired structure the pattern is made of is simply
// not in the IR to query. Matching the token sequence (a negator, then "because", then "but", then
// "because", in that order, inside one unit) recovers it without pretending the IR knows.
//
// It stays narrow on purpose. The bare "not X, but Y" form is left alone: "not a request but an
// order" is ordinary English contrast, and firing on every "not … but" would bury the signal.
// When the IR starts keeping both because-clauses, this can move to the modifier list and become
// as structural as the rest of the file.
const SEQUENCE = ["because", "but", "because"];
function becauseVariant(u: UnitAnalysis): Span | null {
  const tokens = unitTokens(u);
  let i = tokens.findIndex(isNegator);
  if (i < 0) return null;
  for (const want of SEQUENCE) {
    i = tokens.indexOf(want, i + 1);
    if (i < 0) return null;
  }
  return { start: negationStart(u), end: u.span.end };
}

// --- COMMA-VARIANT: "It was never about the money, it was always about control." (#34) ---
//
// The owner's original example ("it was never X, it was always Y") is one sentence, comma-spliced —
// document.ts's splitUnits does not treat "," as a boundary, so this is ONE unit, not two. It is
// also not an in-unit clause PAIR: the rule-based chunker doesn't split the comma splice into two
// clauses at all. What actually lowers ("It was never about the money, it was always about
// control." verified against the real parser) is one clause whose complement swallows the second
// half's SUBJECT ("it") as a bare predicateNoun and drops "always about control" on the floor
// entirely — there is only ever one Clause here, so isReframePairAny (which needs two) has nothing
// to pair. If a future parser change ever does lower this to two clauses, the in-unit loop in
// pairCandidates above already catches it via the normal clause-pair path, taking priority (this
// arm's span would be a strict subset, subsumed by the earlier structural finding).
//
// So this reads the shape off the unit's own text instead: "never" ... a comma ... "always", with a
// be-verb somewhere in the unit to keep it from firing on non-copular near-misses ("It never works,
// but it always ships" has no copula and should not read as this reframe). Being read off text
// rather than confirmed structurally, it reports at "candidate" severity (see types.ts) — never
// scaled up by document density and never given the never/always strength bump, both of which
// assume the confirmed clause-level shape.
function commaVariant(u: UnitAnalysis): Span | null {
  const text = u.unit;
  const never = /\bnever\b/i.exec(text);
  if (!never) return null;
  const comma = text.indexOf(",", never.index);
  if (comma < 0) return null;
  const always = /\balways\b/i.exec(text.slice(comma));
  if (!always) return null;
  if (!/\b(?:is|are|was|were|am|be|been|being)\b/i.test(text)) return null;
  return { start: u.span.start + never.index, end: u.span.end };
}

// --- SUFFICIENCY-VARIANT: "it's not enough to X — you also need Y" ---
//
// The reframe without the symmetry. pairCandidates wants a denial and a replacement that are both
// copular, which is what makes it precise, and it is the reason this shape slips through:
//
//   "It's not enough for the workloads to run—you also need to think about how efficiently they
//    scale, how reliably they're deployed, and what they cost to operate."
//
// The denial IS copular and negated. The replacement is not: different subject, and a requirement
// verb rather than a copula. Structurally the two halves have nothing in common, so no symmetry
// test can pair them, yet the move is the same one — deny that something suffices, then hand the
// reader the thing that does.
//
// Narrow on purpose, and lexically anchored, because loosening the second half to "any clause"
// would fire on ordinary English: "It's not raining, so we went out" is a denial followed by a
// consequence and is nobody's tic. What is required here is a negated SUFFICIENCY word answered by
// an explicit REQUIREMENT, which is a much smaller target than a denial answered by an assertion.
const SUFFICIENCY = /\bnot\s+(?:enough|just|only|simply|merely)\b/i;
const REQUIREMENT = /\b(?:you|we|they|one)\s+(?:also\s+|still\s+)?(?:need|have\s+to|must|want)\b|\bit\s+takes\b|\bwhat\s+(?:really\s+)?matters\s+is\b/i;

// Within one unit, and across the boundary to the next. splitUnits breaks on ";" and ":" as well
// as on a full stop, so "It's not just about speed; you need to think about direction" arrives as
// TWO units and the denial and its answer never meet inside either one. The copular path has the
// same problem and solves it the same way, by looking at consecutive clauses rather than at one.
function sufficiencyVariant(text: string, u: UnitAnalysis, next: UnitAnalysis | undefined): Span | null {
  const denial = SUFFICIENCY.exec(u.unit);
  if (!denial) return null;

  // Same unit: the requirement has to sit past a break, or this is one clause and not a reframe.
  const after = u.unit.slice(denial.index);
  const breakAt = after.search(/[—–;:,-]/);
  if (breakAt >= 0) {
    const req = REQUIREMENT.exec(after);
    if (req && req.index > breakAt) return { start: u.span.start + denial.index, end: u.span.end };
  }

  // The next unit: only when the break between them was a semicolon or colon, which joins two
  // halves of one thought. A full stop between them is two sentences, and that is the copular
  // path's territory rather than this one's.
  if (!next) return null;
  // splitUnits drops the terminator it broke on, so the separator is only visible in the source
  // between the two units. A semicolon or colon joins two halves of one thought; a full stop makes
  // them two sentences, which is the copular path's territory rather than this one's.
  const between = text.slice(u.span.end, next.span.start);
  if (!/[;:]/.test(between)) return null;
  return REQUIREMENT.test(next.unit) ? { start: u.span.start + denial.index, end: next.span.end } : null;
}

function sufficiencyCandidate(span: Span): Candidate {
  return {
    span,
    message: "sufficiency reframe: what is not enough, answered by what is required",
    explanation:
      "This denies that something suffices and then hands the reader the thing that does — the reframe " +
      "without the matching halves that make it obvious. It reads as a lesson being delivered rather " +
      "than a point being made, because the first clause exists only to be corrected by the second. " +
      "Say the requirement on its own: the reader did not propose the insufficient version, so there is " +
      "nothing to take away from them.",
  };
}

// --- PREDICATE-GAP VARIANTS: the reframes the Clause IR cannot pair ---
//
// pairCandidates needs isCopular on both halves, and isCopular needs a `complement` of kind
// predicateNoun or predicateAdj. Two very common forms of this trope never produce one, so the
// flagship rule was silent on both:
//
//   PP predicate   "The trouble was never IN group memberships. It was IN how the rest of the
//                   system found things."
//                  ir.ts's Complement union has no predicate-PP case, so the phrase lowers as a
//                  modifier on the verb. complementHead returns undefined, isCopular returns
//                  false, and there is nothing to pair.
//
//   elliptical     "SaaS Isn't Dead. Sameness Is."
//                  The second half omits its predicate entirely. There is no complement because
//                  the writer deliberately left it out, which is the whole figure.
//
// Both are matched on text rather than through the IR, deliberately. Teaching the lowerer about
// predicate PPs would change the diagram for every sentence in the app; these two shapes are
// narrow enough to recognise from the surface, and doing so leaves lower.ts alone.
const BE = /\b(?:is|are|was|were|isn't|aren't|wasn't|weren't)\b/i;
const BE_NEG = /\b(?:is|are|was|were)\s+(?:not|never)\b|\b(?:isn't|aren't|wasn't|weren't)\b/i;
const ANAPHORIC_BE = /^\s*(?:it|that|this|they|those|these)\s+(?:is|are|was|were)\b/i;
// A unit whose last word is a bare copula: the predicate was left off on purpose.
const ELLIPTICAL_END = /\b(?:is|are|was|were)\s*[.!?]?\s*$/i;

function predicateGapVariant(u: UnitAnalysis, next: UnitAnalysis | undefined): Span | null {
  if (!next) return null;
  if (!BE_NEG.test(u.unit)) return null;

  // Elliptical: the answer drops its predicate. Distinctive enough to stand on its own, and rare
  // in ordinary prose — a sentence ending on a bare "is" is nearly always this figure.
  if (ELLIPTICAL_END.test(next.unit) && BE.test(next.unit)) {
    return { start: u.span.start, end: next.span.end };
  }

  // PP predicate: the answer has to be anaphoric, or this pairs two unrelated sentences that
  // happen to sit next to each other. "It is not raining. That was a long day." must stay clean,
  // and it does, because the denial and the answer have to be about the same thing.
  if (!ANAPHORIC_BE.test(next.unit)) return null;
  // Both halves must carry a prepositional predicate; otherwise pairCandidates already had it.
  const prep = /\b(?:in|about|for|on|at|with|from|of)\b/i;
  return prep.test(u.unit) && prep.test(next.unit) ? { start: u.span.start, end: next.span.end } : null;
}

function predicateGapCandidate(span: Span): Candidate {
  return {
    span,
    message: "Negative parallelism: a denial answered by its replacement",
    explanation:
      "This denies one thing and hands the reader its replacement in the next breath, which is the " +
      "most-identified tell in AI prose. The reader did not propose the denied version, so the first " +
      "half exists only to be corrected by the second. Say the positive claim and stop, and keep the " +
      "contrast only where a reader would genuinely have assumed the other thing.",
  };
}

// --- findings ---

// Severity is a function of how many times the document does this, not of any one instance: once
// can be deliberate, three times is a habit the reader starts hearing.
const severityFor = (count: number): Severity => (count >= 3 ? "high" : count === 2 ? "medium" : "low");

// One severity step up, capped at "high" — the never/always strong bonus. "candidate" findings
// never pass through here: they carry their own fixed severity (see Candidate.severity below).
const SEVERITY_STEPS: readonly Severity[] = ["low", "medium", "high"];
const bump = (s: Severity): Severity => SEVERITY_STEPS[Math.min(SEVERITY_STEPS.indexOf(s) + 1, SEVERITY_STEPS.length - 1)]!;

type Candidate = {
  span: Span;
  message: string;
  explanation: string;
  strong?: boolean; // never/always bonus: bump the count-scaled severity one step
  severity?: Severity; // fixed severity, bypassing both the count scaling and the bump (comma-variant)
};

const quote = (s: string): string => `“${s}”`;

function pairCandidate(a: Clause, b: Clause, span: Span, echo: string | null, strong: boolean): Candidate {
  const denied = pairHead(a)?.text, offered = pairHead(b)?.text;
  const named = denied && offered ? `${quote("not " + denied)} answered by ${quote(offered)}` : "a denial answered by its replacement";
  return {
    span,
    message: `Negative parallelism: ${named}${echo ? `, echoing ${quote(echo)}` : ""}`,
    explanation:
      `You deny a label and hand back its replacement, with the same subject on both sides: “It is not bold. It is backwards.” ` +
      `The reframe sounds like a discovery, but the reader never gets the reasoning — only the swap. ` +
      (echo
        ? `The echo of ${quote(echo)} makes it circular: the word you rejected is the word you kept. `
        : "") +
      `Make the positive claim once, with the detail that earns it — “The rollback undoes two years of work.”`,
    strong,
  };
}

const becauseCandidate = (span: Span): Candidate => ({
  span,
  message: `Negative parallelism: “not because …, but because …”`,
  explanation:
    `“Not because X, but because Y” frames the real reason as a reveal, and the wrong reason is usually one nobody had in mind. ` +
    `Give the reason plainly — “He left because he was bored” — and keep the contrast only when a reader would genuinely have guessed the other one.`,
});

const commaCandidate = (span: Span): Candidate => ({
  span,
  message: `Negative parallelism: “never …, … always …” in one breath`,
  explanation:
    `"It was never X, it was always Y" denies one claim and hands you its replacement in the same sentence, timed as though the writer knew all along. ` +
    `Say what it was, once, plainly — and drop the denial.`,
  severity: "candidate",
});

// Adjacent clause pairs, in document order:
//   in-unit    consecutive clauses of one lowered unit — what a dash variant looks like when a
//              parser manages to lower both halves ("That isn't boldness — it's backwardness").
//   cross-unit the last clause of one unit against the first clause of the next. Unit boundaries
//              are sentence boundaries AND ";" / ":", so this is the two-sentence form and the
//              semicolon form at once.
// A unit can take part in both (its own pair, plus a pair with its neighbour); the spans differ,
// so both are reported and both count toward density.
function pairCandidates(doc: DocAnalysis): Candidate[] {
  const out: Candidate[] = [];
  const clausesOf = (u: UnitAnalysis): Clause[] => u.clauses ?? [];
  doc.units.forEach((unit, i) => {
    const here = clausesOf(unit);
    for (let c = 0; c + 1 < here.length; c++) {
      const [a, b] = [here[c]!, here[c + 1]!];
      if (isReframePairAny(a, b)) {
        out.push(pairCandidate(a, b, { start: negationStart(unit), end: unit.span.end }, echoedWord(a, unit, true), strongPair(a, b)));
      }
    }
    const next = doc.units[i + 1];
    if (!next) return;
    const a = here[here.length - 1], b = clausesOf(next)[0];
    if (a && b && isReframePairAny(a, b)) {
      out.push(pairCandidate(a, b, { start: negationStart(unit), end: next.span.end }, echoedWord(a, next, false), strongPair(a, b)));
    }
  });
  return out;
}

export const reframeRule: TropeRule = {
  id: RULE_ID,
  name: "Negative parallelism (the reframe)",
  tier: "syntactic",
  detect(doc: DocAnalysis, strictness: Strictness = DEFAULT_STRICTNESS): Finding[] {
    // The IR paths first. They know more — a real pairing over lowered clauses — so where one of
    // them has already reported a pair, the text-level fallbacks below must stand down rather than
    // report the same words a second time under a slightly different span.
    const fromIR = [
      ...pairCandidates(doc),
      ...doc.units.flatMap((u) => {
        const span = becauseVariant(u);
        return span ? [becauseCandidate(span)] : [];
      }),
      ...doc.units.flatMap((u) => {
        const span = commaVariant(u);
        return span ? [commaCandidate(span)] : [];
      }),
      ...doc.units.flatMap((u, i) => {
        const span = sufficiencyVariant(doc.text, u, doc.units[i + 1]);
        return span ? [sufficiencyCandidate(span)] : [];
      }),
    ];

    const overlaps = (a: Span, b: Span): boolean => a.start < b.end && b.start < a.end;
    const gapCandidates = doc.units
      .flatMap((u, i) => {
        const span = predicateGapVariant(u, doc.units[i + 1]);
        return span ? [predicateGapCandidate(span)] : [];
      })
      .filter((c) => !fromIR.some((seen) => overlaps(seen.span, c.span)));

    const candidates = [...fromIR, ...gapCandidates];

    // One span, one finding. Two candidates can land on the same range (a dash unit whose clauses
    // pair up AND whose neighbour pairs with it); the runner would dedupe them anyway, but doing it
    // here keeps the density count honest.
    const bySpan = new Map<string, Candidate>();
    for (const c of candidates) {
      const key = `${c.span.start}:${c.span.end}`;
      if (!bySpan.has(key)) bySpan.set(key, c);
    }
    const unique = [...bySpan.values()].sort((x, y) => x.span.start - y.span.start || x.span.end - y.span.end);

    // Density scales the base severity; the never/always bonus then bumps it one step further. A
    // candidate with a fixed `severity` (the comma-variant, read off text rather than confirmed
    // structurally) skips both — it always reports at "candidate".
    const baseSeverity = severityFor(unique.length);
    const density = unique.length >= 2 ? ` You do this ${unique.length} times in this piece; that rhythm is the tell.` : "";
    return unique.map((c) => ({
      ruleId: RULE_ID,
      span: c.span,
      severity: severityAt(c.severity ?? (c.strong ? bump(baseSeverity) : baseSeverity), strictness),
      message: c.message,
      explanation: c.explanation + density,
    }));
  },
};

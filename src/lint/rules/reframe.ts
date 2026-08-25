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

import type { Clause } from "../../ir.js";
import type { DocAnalysis, Finding, Severity, Span, TropeRule, UnitAnalysis } from "../types.js";
import { complementHead, isCopular, isNegated, subjectHead, subjectIsPronominal } from "../ir-query.js";

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

// Where the negation sits, for the start of the reported span. "not" as its own word, or the
// contraction fused onto the verb ("isn't", "wasn't"). Falls back to the start of the unit when
// there are no word offsets to point at — a span covering the whole unit is still honest, it is
// just blunter than "starting at the word that does the denying".
const isNegator = (w: string): boolean => /^not$/i.test(w) || /n't$/i.test(w);
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
const isReframePair = (a: Clause, b: Clause): boolean =>
  isCopular(a) && isNegated(a) && isCopular(b) && !isNegated(b) && corefer(a, b);

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
  const head = complementHead(a);
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

// --- findings ---

// Severity is a function of how many times the document does this, not of any one instance: once
// can be deliberate, three times is a habit the reader starts hearing.
const severityFor = (count: number): Severity => (count >= 3 ? "high" : count === 2 ? "medium" : "low");

type Candidate = { span: Span; message: string; explanation: string };

const quote = (s: string): string => `“${s}”`;

function pairCandidate(a: Clause, b: Clause, span: Span, echo: string | null): Candidate {
  const denied = complementHead(a)?.text, offered = complementHead(b)?.text;
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
  };
}

const becauseCandidate = (span: Span): Candidate => ({
  span,
  message: `Negative parallelism: “not because …, but because …”`,
  explanation:
    `“Not because X, but because Y” frames the real reason as a reveal, and the wrong reason is usually one nobody had in mind. ` +
    `Give the reason plainly — “He left because he was bored” — and keep the contrast only when a reader would genuinely have guessed the other one.`,
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
      if (isReframePair(a, b)) {
        out.push(pairCandidate(a, b, { start: negationStart(unit), end: unit.span.end }, echoedWord(a, unit, true)));
      }
    }
    const next = doc.units[i + 1];
    if (!next) return;
    const a = here[here.length - 1], b = clausesOf(next)[0];
    if (a && b && isReframePair(a, b)) {
      out.push(pairCandidate(a, b, { start: negationStart(unit), end: next.span.end }, echoedWord(a, next, false)));
    }
  });
  return out;
}

export const reframeRule: TropeRule = {
  id: RULE_ID,
  name: "Negative parallelism (the reframe)",
  tier: "syntactic",
  detect(doc: DocAnalysis): Finding[] {
    const candidates = [...pairCandidates(doc), ...doc.units.flatMap((u) => {
      const span = becauseVariant(u);
      return span ? [becauseCandidate(span)] : [];
    })];

    // One span, one finding. Two candidates can land on the same range (a dash unit whose clauses
    // pair up AND whose neighbour pairs with it); the runner would dedupe them anyway, but doing it
    // here keeps the density count honest.
    const bySpan = new Map<string, Candidate>();
    for (const c of candidates) {
      const key = `${c.span.start}:${c.span.end}`;
      if (!bySpan.has(key)) bySpan.set(key, c);
    }
    const unique = [...bySpan.values()].sort((x, y) => x.span.start - y.span.start || x.span.end - y.span.end);

    const severity = severityFor(unique.length);
    const density = unique.length >= 2 ? ` You do this ${unique.length} times in this piece; that rhythm is the tell.` : "";
    return unique.map((c) => ({
      ruleId: RULE_ID,
      span: c.span,
      severity,
      message: c.message,
      explanation: c.explanation + density,
    }));
  },
};

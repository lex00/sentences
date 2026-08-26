// THE QUANTITY HOOK (#34) — a headline number with no sentence around it, answered by a fragment
// that voids it. "3 rules. And none you set." "Twelve engineers. Zero tests." "Six weeks of
// planning. Not one line shipped."
//
// This is a hook formula, not a rhythm. The count is doing the work a first sentence would
// normally do: it buys attention with a specific-sounding number, then the second beat takes the
// number away, and the reader is two fragments in with no claim to disagree with yet. It is
// everywhere in the post-shaped register the rest of this tier covers, and it is one of the few
// tells that reads as a tell on a SINGLE instance — ordinary prose does not open a paragraph with
// a bare quantity and then negate it, because ordinary prose puts the number inside a sentence.
//
// --- why discourse/punchy-fragments does not already cover this ---
//
// It fires on four of the ten specimens below, and the four are arbitrary. punchy-fragments needs a
// run of >= 2 consecutive units with outcome === "fragment", and the second beat of this formula
// usually has a verb in it, so document.ts calls it "unparseable" and fragments.ts (correctly, per
// its own header) refuses to treat unparseables as fragments:
//
//   "3 rules. And none you set."             "And none you set"      -> unparseable  (silent)
//   "A thousand dashboards. Nobody reading them."  "Nobody reading"  -> unparseable  (silent)
//   "One question. Nobody could answer it."  full clause             -> unparseable  (silent)
//   "Six weeks of planning. Not one line shipped."                   -> unparseable  (silent)
//   "Fifteen meetings. No decisions."        both verbless           -> FIRES
//   "Two options. Neither one good."         both verbless           -> FIRES
//
// So coverage is decided by whether the negation happens to contain a verb, which has nothing to do
// with the trope. And when it does fire, it hands the reader the wrong note: "choppy staccato
// rhythm, let some of these be full sentences" is advice about rhythm, and the problem here is that
// a number is being used as a hook. This rule reads the SHAPE (a quantity, then a void) instead of
// the parse outcome, so the verb in the second beat stops mattering.
//
// --- what is deliberately NOT here: the disproportion variant ---
//
// "Four hours. One line of code." and "5 minutes. That's all it took." are the same formula with
// the second beat diminishing the first instead of negating it. They are left out, and the reason
// is that nothing structural separates them from an ingredient list or a spec sheet:
//
//   "Four hours. One line of code."     quantity fragment, quantity fragment
//   "2 eggs. 1 cup flour."              quantity fragment, quantity fragment
//
// Telling those apart needs to know that four hours is a lot and one line is a little, which is
// semantics this rule cannot see. Requiring an explicit VOIDER in the second beat is what makes the
// rule safe to fire on one instance, so that requirement is the rule, not a threshold on it. If the
// disproportion variant is ever wanted, it belongs behind "candidate" severity (see types.ts) as a
// structurally-narrowed suspect, not here.

import type { DocAnalysis, Finding, Severity, TropeRule, UnitAnalysis, WordSpan } from "../types.js";
import { makeContext, suppressed, type Context } from "./fragments.js";
import { spanning } from "../span.js";

const RULE_ID = "discourse/quantity-hook";

// Lengths. The count beat is a noun phrase ("Six weeks of planning" is the longest specimen at 4);
// the void beat runs a word or two longer because it may carry a verb ("Nobody could answer it").
// Past these the beat is a sentence, and a sentence is not a hook.
const MAX_COUNT_WORDS = 5;
const MAX_VOID_WORDS = 6;

// --- the count beat ---

// Spelled cardinals. Ordinals are absent on purpose: "First rule. None you set." is a different
// (and ordinary) shape — an ordinal enumerates, it does not quantify.
const CARDINALS = new Set([
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen",
  "nineteen", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety",
  "hundred", "thousand", "million", "billion", "dozen",
]);

// "a thousand dashboards", "a dozen meetings" — the article carries no quantity on its own, so it
// only counts when the next token does. Kept to the big round ones: "a rule" is not a quantity.
const ARTICLE_QUANTIFIABLE = new Set(["dozen", "hundred", "thousand", "million", "billion"]);

const DIGIT_QUANTITY = /^\d/; // 3, 40%, 1,000 — anything opening with a digit

// Crude finite-verb evidence, the same idiom and for the same reason as contrast-tail.ts's: this
// rule runs on the parser-free path too, where no POS tags exist, and every word here can only be a
// verb. It is what keeps "Twelve engineers are idle." out of the count beat — and it is needed
// because the parse alone is not reliable on a bare noun phrase (the rule-based chunker lowers
// "Twelve engineers" as a clause, reading the noun "engineers" as a verb, while calling "3 rules" a
// fragment; keying on outcome would make coverage depend on that coin-flip).
const FINITE_VERBS = new Set([
  "is", "are", "was", "were", "am", "be", "been", "being",
  "has", "have", "had", "does", "do", "did",
  "will", "would", "can", "could", "shall", "should", "may", "might", "must",
]);

const isWordToken = (w: WordSpan): boolean => /[\p{L}\p{N}]/u.test(w.text);

const wordsOf = (u: UnitAnalysis): string[] => u.words.filter(isWordToken).map((w) => w.text);

const isQuantity = (w: string): boolean => DIGIT_QUANTITY.test(w) || CARDINALS.has(w.toLowerCase());

// The count beat: short, opening on a quantity, carrying no finite verb of its own.
function isCountBeat(ctx: Context, u: UnitAnalysis): boolean {
  if (suppressed(ctx, u.span)) return false;
  const words = wordsOf(u);
  if (words.length < 2 || words.length > MAX_COUNT_WORDS) return false;
  if (words.some((w) => FINITE_VERBS.has(w.toLowerCase()))) return false;

  const first = words[0]!.toLowerCase();
  if (isQuantity(first)) return true;
  // "A thousand dashboards" — article plus a big round number.
  return (first === "a" || first === "an") && ARTICLE_QUANTIFIABLE.has(words[1]!.toLowerCase());
}

// --- the void beat ---

// Words that take the count away. "not" covers "Not one line shipped"; "no" covers both "No
// decisions" and "no one". Every entry has to VOID rather than merely modify — "few", "some" and
// "half" are absent because "Twelve engineers. Half of them remote." is a report, not a hook.
const VOIDERS = new Set([
  "none", "no", "nobody", "nothing", "never", "neither", "nowhere", "not", "zero",
]);

// A leading conjunction is part of the formula ("And none you set"), not part of the negation, so
// it is skipped before looking for the voider rather than blocking the match.
const LEADING_CONJUNCTIONS = new Set(["and", "but", "yet", "still", "so"]);

// The void beat: short, and negating within its first couple of tokens. Position matters — a voider
// buried at the end ("Twelve engineers, and the scheduler is not done") is a clause that happens to
// contain a negative, not a beat that opens by taking the count away. Deliberately NOT tested for
// verblessness: the second beat carrying a verb is exactly the case punchy-fragments misses.
const VOIDER_SEARCH_DEPTH = 2;

function isVoidBeat(ctx: Context, u: UnitAnalysis): boolean {
  if (suppressed(ctx, u.span)) return false;
  const words = wordsOf(u);
  if (words.length < 1 || words.length > MAX_VOID_WORDS) return false;

  let i = 0;
  if (LEADING_CONJUNCTIONS.has(words[0]!.toLowerCase())) i = 1;
  return words.slice(i, i + VOIDER_SEARCH_DEPTH).some((w) => VOIDERS.has(w.toLowerCase()));
}

// --- the rule ---

export const quantityHookRule: TropeRule = {
  id: RULE_ID,
  name: "The quantity hook",
  tier: "discourse",
  detect(doc: DocAnalysis): Finding[] {
    const ctx = makeContext(doc);
    const units = doc.units;
    const findings: Finding[] = [];

    for (let i = 0; i + 1 < units.length; i++) {
      const count = units[i]!;
      const voided = units[i + 1]!;
      if (!isCountBeat(ctx, count) || !isVoidBeat(ctx, voided)) continue;

      // Opening position is the formula in its native habitat: a hook is a hook because it is the
      // first thing the reader meets. Mid-document the same pair is likelier to be a writer landing
      // one deliberate beat, so it reports a step lower.
      const opensDocument = i === 0;
      const severity: Severity = opensDocument ? "medium" : "low";

      findings.push({
        ruleId: RULE_ID,
        span: spanning([count, voided]),
        severity,
        message: `A bare quantity answered by a negation: “${count.unit.trim()}. ${voided.unit.trim()}.”`,
        explanation:
          `“${count.unit.trim()}.” is not a sentence, it is a number used as bait, and ` +
          `“${voided.unit.trim()}.” takes the number back before the reader has been told anything. ` +
          `Two beats in there is still no claim to agree or disagree with, which is the point of ` +
          `the formula and the reason it reads as written-for-the-feed rather than written. ` +
          `${opensDocument ? "Opening on it makes it the first thing the reader meets. " : ""}` +
          `Put the count inside the sentence that makes the argument: what were the three rules, ` +
          `who set them, and what went wrong because of it.`,
      });

      i++; // a beat belongs to one pair; don't let a void beat also open the next
    }

    return findings;
  },
};

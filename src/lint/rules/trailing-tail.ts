// THE TRAILING TAIL (discourse tier) — a sentence that has finished saying its thing and then adds
// a comma and one more phrase:
//
//   "...produces a parse, with a rule-based fallback parser."
//   "...the same linter over stdio, for an agent that wants its prose checked while it writes."
//
// WHY THIS IS A DISCOURSE RULE AND NOT A SYNTACTIC ONE. The shape by itself is ordinary English and
// the tier placement is the honest admission of that. Measured over this repository's own
// hand-written documentation — 5040 words across six files — the narrowed shape below occurs 15
// times, 2.98 per 1000 words, and reading them back every one is doing real work: a prepositional
// modifier, a parenthetical, an apposition. There is no structural property separating those from
// the tack-on that got appended because the sentence felt too short, which is exactly the judgment
// a parser cannot make and a reader makes instantly. So the rule does not try to make it per
// sentence. Only the RATE is the tell: one trailing phrase is prose, and a document that ends a
// sentence this way every hundred words has a cadence, and the cadence is what a reader hears.
//
// Everything reports at `candidate` severity (types.ts: structurally narrowed, unconfirmable
// without semantics) and never escalates. A finding here is an invitation to look, and the thing
// worth looking at is whether the second half earns its comma — which is a question for whoever is
// holding the document. fix/oracle.ts is how an answer gets refereed if a model proposes one.
//
// --- the narrowing, and what each exclusion is for ---
// A tail qualifies only if the LAST comma segment of the unit is a bare phrase. Everything below is
// a category where the tail's job is already visible from its first word, so nothing is gained by
// reporting it:
//
//   coordination     "and", "or", "but", "nor", "plus" — the tail is the last item of a list.
//   relative clause  "which", "who", "that", "where"… — the tail modifies something named, and
//                    says which thing it modifies.
//   subordinator     "because", "since", "while", "if"… — the tail is a reason or a condition.
//   contrast         "not", "never", "rather" — rules/contrast-tail.ts owns the terminal ", not X"
//                    dismissal and says more about it than this rule could.
//   participle       a tail opening on an "-ing" word — rules/ing-tackon.ts owns the superficial
//                    "-ing" tack-on, with a lexicon and a parse behind its judgment.
//   a real predicate any auxiliary or copula anywhere in the tail, or an embedded relative or
//                    subordinator. A tail with a predicate in it is a clause, and a second clause
//                    is a sentence the author chose to join, not a phrase they appended.
//
// Length bands do the rest. The head must be substantial (the sentence has to have said something
// before it trails off) and the tail has to be long enough to be a phrase and short enough not to
// be the sentence's real payload.
//
// --- thresholds, measured not guessed ---
//   MIN_WORDS        300   below this a per-1000 rate is noise; two tails in a 229-word file reads
//                          as 8.7 per 1000 and means nothing.
//   MIN_TAILS        4     an absolute floor. Three trailing phrases is not yet a cadence at any
//                          document length.
//   RATE_THRESHOLD   6     per 1000 words: twice the 2.98 measured across this repo's own prose.
//                          At this setting every file in docs/ stays silent, which is the
//                          calibration — the rule has to be quiet on deliberate human writing
//                          before it is worth anything on the other kind.
//
// STRICTNESS (strictness.ts). Both floors move with the dial, and this rule is the clearest case
// for it: at level 3 they go to zero, so a SINGLE trailing phrase reports. That is the setting for
// somebody who does not want the shape at all rather than somebody measuring a cadence, and it
// turns this rule from a rate detector into a prohibition. MIN_WORDS is NOT moved — a per-1000
// rate over 40 words is meaningless at any strictness, and at level 3 there is no rate left to
// compute anyway.

import { inKind, markdownContext } from "../markdown.js";
import type { DocAnalysis, Finding, TropeRule, UnitAnalysis } from "../types.js";
import { countWords } from "../score.js";
import type { Strictness } from "../strictness.js";
import { DEFAULT_STRICTNESS, floorAt, rateAt, severityAt } from "../strictness.js";

const RULE_ID = "discourse/trailing-tail";

const MIN_WORDS = 300;
const MIN_TAILS = 4;
const RATE_THRESHOLD = 6;

const MIN_TAIL_WORDS = 3;
const MAX_TAIL_WORDS = 12;
const MIN_HEAD_WORDS = 8;

const COORDINATORS = new Set(["and", "or", "but", "nor", "plus", "yet"]);
const RELATIVIZERS = new Set(["which", "who", "whom", "whose", "where", "when", "that"]);
const SUBORDINATORS = new Set([
  "so", "because", "since", "if", "while", "although", "though", "unless", "until",
  "after", "before", "as", "once", "whereas", "whether",
]);
const CONTRAST = new Set(["not", "never", "rather"]);
// Auxiliaries and copulas: one of these anywhere in the tail means it has a predicate of its own.
const PREDICATE = new Set([
  "is", "are", "was", "were", "be", "been", "being", "am",
  "has", "have", "had", "does", "do", "did",
  "will", "would", "shall", "should", "can", "could", "may", "might", "must",
]);

const SUPPRESSED = ["heading", "bullet", "codeFence", "blockquote"] as const;

const tokens = (s: string): string[] => (s.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? []);

// Parenthesised spans, blanked to spaces so a comma inside one cannot be mistaken for the comma
// that splits the sentence. A citation or an aside — "(TCS 248, 2000)", "(L5.9, memo)" — carries
// its own commas, and taking the last one lands INSIDE the parentheses: the "tail" comes back as
// "2000)" and the real trailing phrase before the aside is never seen. Blanking keeps the string
// the same length, so every offset below still indexes the unit.
// Reported by an external consumer of this package, who hit the same hazard from the other side:
// a rule that COUNTS commas to find two-part sentences sees a citation as a third comma and stays
// silent on a real offender. Same cause, opposite symptom.
const blankParens = (s: string): string => s.replace(/\([^)]*\)/g, (m) => " ".repeat(m.length));

// The unit's trailing comma phrase, or null when its last segment is not a bare phrase. Text-only
// by design: this rule reads the surface form and never the Clause IR, the same crude-but-stated
// approach rules/contrast-tail.ts takes, and for the same reason — the shapes it excludes are
// identifiable from the tail's first word.
export function bareTail(unit: string): string | null {
  const comma = blankParens(unit).lastIndexOf(",");
  if (comma < 0) return null;

  const tail = unit.slice(comma + 1).trim();
  const head = unit.slice(0, comma).trim();
  const tailWords = tokens(tail);
  if (tailWords.length < MIN_TAIL_WORDS || tailWords.length > MAX_TAIL_WORDS) return null;
  if (tokens(head).length < MIN_HEAD_WORDS) return null;

  const first = tailWords[0]!;
  if (COORDINATORS.has(first) || RELATIVIZERS.has(first) || SUBORDINATORS.has(first)) return null;
  if (CONTRAST.has(first) || first.endsWith("ing")) return null;
  if (tailWords.some((t) => PREDICATE.has(t) || RELATIVIZERS.has(t) || SUBORDINATORS.has(t))) return null;

  return tail;
}

type Hit = { unit: UnitAnalysis; tail: string };

export const trailingTailRule: TropeRule = {
  id: RULE_ID,
  name: "Trailing tail (the appended closing phrase)",
  tier: "discourse",
  detect(doc: DocAnalysis, strictness: Strictness = DEFAULT_STRICTNESS): Finding[] {
    const words = countWords(doc.text);
    // The short-document guard is the one floor the dial does not touch: see STRICTNESS above.
    if (words < MIN_WORDS && strictness !== 3) return [];

    const ctx = markdownContext(doc.text);
    const hits: Hit[] = [];
    for (const unit of doc.units) {
      if (SUPPRESSED.some((k) => inKind(ctx, unit.span, k))) continue;
      const tail = bareTail(unit.unit);
      if (tail) hits.push({ unit, tail });
    }

    if (hits.length === 0) return [];
    const rate = (hits.length / words) * 1000;
    if (hits.length < floorAt(MIN_TAILS, strictness) || rate < rateAt(RATE_THRESHOLD, strictness)) return [];

    const perThousand = rate.toFixed(1);
    return hits.map(({ unit, tail }) => ({
      ruleId: RULE_ID,
      span: unit.span,
      severity: severityAt("candidate", strictness),
      message:
        strictness === 3
          ? `Trailing phrase: “, ${tail}”`
          : `Trailing phrase: “, ${tail}” — ${hits.length} sentences end this way (${perThousand}/1000 words)`,
      explanation:
        `This sentence finishes its point and then adds a comma and one more phrase — “, ${tail}”. ` +
        (strictness === 3
          ? `At strictness 3 the rate is not the question; the shape is, and this document has ${hits.length} of them. `
          : `One of those is prose; ${hits.length} of them in ${words} words is a cadence the reader starts hearing, ` +
            `which is why this reports on the rate and not on the sentence. `) +
        `Read the second half on its own and ask what it is for: if it names something the first half left out, ` +
        `keep it; if it is there because the sentence felt too short, the sentence was long enough. Nothing ` +
        `structural can tell those apart, so this is a candidate, not a verdict.`,
    }));
  },
};

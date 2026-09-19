// SENTENCE-INITIAL CONJUNCTION — "And ...", "But ...", "So ..." as a rhythm rather than a turn.
//
// Starting a sentence with a conjunction is not an error and never was. One of them is emphasis: a
// writer breaks a clause off to land it harder. The tell is the RATE. A document that opens one
// sentence in twenty this way has a voice; a document that does it one in ten has a tic, because
// every conjunction promises a relationship to the sentence before it and after enough of them the
// reader stops believing the promise.
//
// MEASURED, which is the only reason the threshold is where it is. Across a 39,793-word corpus of
// the register this linter targets and this repository's own documentation as a human-written
// baseline:
//
//                        corpus (n=27)        baseline (n=6)
//   median                    2.7%                  0.0%
//   p75                       3.9%                  1.9%
//   max                       9.2%                  2.3%
//
// The baseline never reaches 3%, so that is where the floor sits: above every hand-written
// document measured, below the corpus's upper half. It fires on the densest third of the corpus
// and on none of the baseline, which is the trade this rule is willing to make. Reported at the
// DOCUMENT level, on each offending sentence, because no single one of them is the problem.
//
// "Because" is in the set and "However"/"Therefore" are not. A sentence opening on "because" is a
// fragment wearing a conjunction — the subordinate half of a sentence whose main clause is in the
// previous full stop. "However" and "therefore" are adverbs that have always been allowed to open
// a sentence and carry no such implication.

import type { DocAnalysis, Finding, Severity, TropeRule } from "../types.js";
import type { Strictness } from "../strictness.js";
import { DEFAULT_STRICTNESS, floorAt, rateAt, severityAt } from "../strictness.js";
import { inKind, markdownContext } from "../markdown.js";

const RULE_ID = "discourse/conjunction-opener";

const OPENERS = /^(?:and|but|so|yet|because)\b/i;
const MIN_UNITS = 12; // below this a percentage is noise, not a rate
const MIN_OPENERS = 3; // three is the smallest number that can be a habit
const RATE_THRESHOLD = 3; // percent of sentences; the baseline's maximum was 2.3
const HIGH_AT = 6; // twice the floor: the rhythm is the document's, not a stretch of it
const SUPPRESSED = ["heading", "bullet", "codeFence", "blockquote"] as const;

export const conjunctionOpenerRule: TropeRule = {
  id: RULE_ID,
  name: "Sentence-initial conjunction as a rhythm",
  tier: "discourse",
  detect(doc: DocAnalysis, strictness: Strictness = DEFAULT_STRICTNESS): Finding[] {
    const ctx = markdownContext(doc.text);
    const prose = doc.units.filter((u) => !SUPPRESSED.some((k) => inKind(ctx, u.span, k)));
    if (prose.length < MIN_UNITS && strictness !== 3) return [];

    const hits = prose.filter((u) => OPENERS.test(u.unit.trim()));
    if (hits.length === 0) return [];

    const pct = (hits.length / prose.length) * 100;
    if (hits.length < floorAt(MIN_OPENERS, strictness) || pct < rateAt(RATE_THRESHOLD, strictness)) return [];

    const rounded = Math.round(pct * 10) / 10;
    const base: Severity = pct >= HIGH_AT ? "medium" : "low";
    const severity = severityAt(base, strictness);

    return hits.map((u) => ({
      ruleId: RULE_ID,
      span: u.span,
      severity,
      message: `opens on “${u.unit.trim().split(/\s+/)[0]}” — ${hits.length} of ${prose.length} sentences do (${rounded}%)`,
      explanation:
        `${hits.length} of this document's ${prose.length} sentences open on a bare conjunction, ${rounded}% of them. ` +
        `One is emphasis: a clause broken off to land harder. At this rate it is a cadence, and every "And" ` +
        `promises the reader a relationship to the sentence before it that most of them do not deliver. ` +
        `Join the ones that really are continuations to the sentence they continue, and let the rest start ` +
        `on their own subject.`,
    }));
  },
};

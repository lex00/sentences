// THE LOW-VALUE SENTENCE (discourse tier) — a whole sentence inside a long paragraph that
// introduces nothing. Not a clumsy phrase and not a repeated word: an entire sentence you can
// delete and lose no information, because every content word in it was already on the page a
// sentence ago.
//
//   "The scheduler rewrite cost two quarters and shipped in March. We rewrote the scheduler, and
//    that rewrite was what cost the two quarters."
//
// The second sentence is the target. It reads like development and is restatement.
//
// --- the gate: paragraphs over 50 words ---
// Short paragraphs are exempt outright. A three-sentence paragraph that circles back on itself is
// a writer making a point twice in the space where a reader can still see both sentences at once;
// what this rule is looking for is the padding that accumulates once a paragraph is long enough
// that nobody rereads it. Fifty words is the floor — roughly three ordinary sentences — and it is
// also what keeps the rule off the cross-rule fixture corpus, where near-miss prose is short by
// construction.
//
// --- what counts as "adds nothing" ---
// Content words only (content-words.js's STOPWORDS removes the function words), folded through the
// same lemmatizer (so "parser"/"parsers" and "rewrote"/"rewrite" do not read as new material by
// accident). A sentence is flagged when every one of its content lemmas already appeared in an
// EARLIER sentence of the same paragraph.
//
// Paragraph-local, deliberately. A new paragraph is allowed to pick up the previous one's
// vocabulary — that is how paragraphs connect — and a document that recycles vocabulary globally
// is already what repetition/dilution measures. Scoping to the paragraph is the whole difference
// between this rule and the two in rules/repetition.ts: near-duplicate asks "did you write this
// sentence twice?" (character overlap, document-wide), dilution asks "how much of the document is
// restated 3-word runs?", and this one asks "inside this paragraph, is there a sentence carrying
// no new content at all?". A sentence can fail this test while sharing almost no surface wording
// with anything before it, which is exactly the case the other two miss.
//
// --- thresholds and why ---
//   MIN_CONTENT_WORDS 3   A sentence with one or two content words is too thin to judge. "So the
//                         build fails." recycles both of its content words and is a legitimate
//                         conclusion, not padding; requiring three keeps every short concluding
//                         line out, which is also where rules/aphoristic-ender.ts already looks.
//   THIN_MIN_CONTENT  8   A substantial sentence that introduces exactly ONE new content word is
//                         usually padding and occasionally a real synthesis, and nothing
//                         structural separates them. That is what Severity "candidate" is for
//                         (see types.ts): it reports at quarter weight and never swings a score.
//
// --- what it deliberately does not catch ---
//   * two new content words in a long sentence — past one, the false-positive rate on ordinary
//     technical prose stops being worth the finding.
//   * restatement across a paragraph break. Scope note above; that is dilution's measurement.
//   * a sentence that recycles every content word but inverts the claim ("The parser does not read
//     the input"). Negation is meaning, and this rule counts vocabulary, not truth. Rare enough in
//     the padding case to accept as a false positive; reframe.ts owns denied-then-replaced pairs.
//   * a quoted sentence. Quoting someone restating your own point is still restatement, and a
//     third copy of the quote-interval scanner (rules/fragments.ts and rules/aphoristic-ender.ts
//     each carry one) would not earn its place for a case the 3-content-word floor already makes
//     rare.
//
// Headings, bullets, code fences and blockquotes need no suppression here: markdown.ts builds
// paragraphs out of runs of PROSE lines only, so none of them can be inside one.

import { STOPWORDS, lemmatize } from "../content-words.js";
import { markdownContext } from "../markdown.js";
import type { DocAnalysis, Finding, Severity, Span, TropeRule, UnitAnalysis, WordSpan } from "../types.js";

const RULE_ID = "discourse/low-value-sentence";

const PARAGRAPH_MIN_WORDS = 50; // strictly more than this, per the gate note above
const MIN_CONTENT_WORDS = 3;
const THIN_MIN_CONTENT = 8;
const MIN_WORD_LEN = 2; // "AI" and "UI" are content; single letters are not

// --- words ------------------------------------------------------------------------------------

// Word tokens in `text`, matching build-doc.ts's scan (letters/digits with internal apostrophes
// and hyphens). Used for the paragraph gate so the number means what a reader means by "how long
// is this paragraph", independent of which doc builder produced the units.
const WORD_RE = /[\p{L}\p{N}]+(?:['‘’ʼ-][\p{L}\p{N}]+)*/gu;
const countWords = (text: string): number => (text.match(WORD_RE) ?? []).length;

// Both doc builders can appear in `words` (stub-doc's letters/digits scan, the real pipeline's
// tokenizer that peels punctuation into its own token), so ignore anything without a letter or
// digit in it — the same idiom rules/fragments.ts and rules/aphoristic-ender.ts use.
const isWordToken = (w: WordSpan): boolean => /[\p{L}\p{N}]/u.test(w.text);

// The sentence's content lemmas, in order, with duplicates kept — a sentence that says "parser"
// three times has three content words and one lemma, and the MIN_CONTENT_WORDS floor is about how
// much sentence there is to judge, not how varied it is.
function contentLemmas(unit: UnitAnalysis): string[] {
  const out: string[] = [];
  for (const w of unit.words) {
    if (!isWordToken(w)) continue;
    const lc = w.text.toLowerCase();
    // A token carrying a digit is information whatever its length ("47", "v2"), and no digit token
    // is a function word.
    if (!/\p{N}/u.test(lc) && (lc.length < MIN_WORD_LEN || STOPWORDS.has(lc))) continue;
    out.push(lemmatize(lc));
  }
  return out;
}

// --- paragraphs --------------------------------------------------------------------------------

// Units wholly inside the paragraph, in document order. Whole-span containment, so a unit that
// straddles a paragraph boundary (document.ts's splitUnits does not break on newlines) belongs to
// neither — the same blunt choice rules/aphoristic-ender.ts makes, for the same reason.
const unitsIn = (units: readonly UnitAnalysis[], span: Span): UnitAnalysis[] =>
  units.filter((u) => u.span.start >= span.start && u.span.end <= span.end);

const severityFor = (count: number): Severity => (count >= 3 ? "high" : count === 2 ? "medium" : "low");

const preview = (text: string, max = 60): string => {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
};

type Hit = { unit: UnitAnalysis; novel: number; content: number; echoed: string[] };

export const lowValueSentenceRule: TropeRule = {
  id: RULE_ID,
  name: "Low-value sentence in a long paragraph",
  tier: "discourse",
  detect(doc: DocAnalysis): Finding[] {
    const ctx = markdownContext(doc.text);
    const recaps: Hit[] = [];
    const thin: Hit[] = [];

    for (const paragraph of ctx.paragraphs) {
      const units = unitsIn(doc.units, paragraph.span);
      if (units.length < 2) continue; // nothing to delete without deleting the paragraph
      if (countWords(doc.text.slice(paragraph.span.start, paragraph.span.end)) <= PARAGRAPH_MIN_WORDS) continue;

      const seen = new Set<string>();
      for (const [i, unit] of units.entries()) {
        const lemmas = contentLemmas(unit);
        // The first sentence establishes the vocabulary; by construction it has nothing to echo.
        if (i > 0 && lemmas.length >= MIN_CONTENT_WORDS) {
          const novel = lemmas.filter((l) => !seen.has(l));
          const hit: Hit = {
            unit,
            novel: novel.length,
            content: lemmas.length,
            echoed: [...new Set(lemmas.filter((l) => seen.has(l)))],
          };
          if (novel.length === 0) recaps.push(hit);
          else if (novel.length === 1 && lemmas.length >= THIN_MIN_CONTENT) thin.push(hit);
        }
        for (const l of lemmas) seen.add(l);
      }
    }

    const severity = severityFor(recaps.length);
    const density =
      recaps.length >= 2
        ? ` ${recaps.length} sentences in this piece do it; at that rate the padding is the texture of the writing, not a slip.`
        : "";

    return [
      ...recaps.map(({ unit, content, echoed }) => ({
        ruleId: RULE_ID,
        span: unit.span,
        severity,
        message: `Low-value sentence: all ${content} content words already appeared earlier in the paragraph`,
        explanation:
          `Every content word in “${preview(unit.unit)}” — ${echoed.slice(0, 5).map((w) => `“${w}”`).join(", ")} — ` +
          `was already on the page earlier in this same paragraph, so the sentence restates rather than develops. ` +
          `Delete it and the paragraph loses nothing; if it was meant to draw a conclusion, say the conclusion in ` +
          `words the paragraph has not used yet.` +
          density,
      })),
      ...thin.map(({ unit, content }) => ({
        ruleId: RULE_ID,
        span: unit.span,
        severity: "candidate" as Severity,
        message: `Thin sentence: ${content} content words, 1 of them new to the paragraph`,
        explanation:
          `“${preview(unit.unit)}” is a full-length sentence that introduces a single content word the paragraph ` +
          `hasn't already used. That is usually padding and occasionally a real synthesis, which is why this reports ` +
          `as a candidate rather than a finding — read it once and decide. If it is padding, the new word is probably ` +
          `the only part worth keeping.`,
      })),
    ];
  },
};

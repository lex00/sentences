// Fixtures for rules/staccato-register.ts — the de-punctuated document. The finding's span is
// always the whole document, same convention as fixtures/claude-sounds-like-claude.ts and
// repetition-dilution.ts: spanText is the fixture's entire text, which the battery's exact-substring
// match covers for the [0, length) case with no format extension.
//
// WHY THE INTERESTING NEGATIVES ARE NOT HERE. This rule's two hard negatives are a 300-word human
// LinkedIn post (one-sentence paragraphs, ordinary commas) and a terse Hemingway-shaped passage
// (no internal punctuation at all, sentences grouped into paragraphs). Both need to be long enough
// to clear the rule's own size gates before they prove anything — and the battery's cross-rule
// check holds every negative to "no registered rule may fire on this", which a 300-word passage of
// real prose will not survive for reasons that have nothing to do with this rule. They live in
// rules/staccato-register.test.ts instead, calling detect() directly, which is where the
// sounds-like-claude fixture parks the same problem for the same reason.

import type { RuleFixtures } from "./types.js";

// 15 sentences over 13 paragraphs, 12 of them a single sentence, zero internal punctuation.
// Nothing decorative and nothing shouted, so this one lands at "low": the register alone.
const PLAIN = [
  "The deploy failed again this morning.",
  "Nobody on the team knew why.",
  "We had shipped the same change on Friday without any trouble.",
  "The difference was the cache.",
  "It had been warm on Friday and it was cold today.",
  "That is the whole story.",
  "We are not slow because the tests are slow.",
  "We are slow because nothing tells us what changed.",
  "The dashboard shows the symptom.",
  "It does not show the cause.",
  "Every incident this quarter has ended the same way.",
  "Someone reads the diff by hand and finds it.",
  "Lock it down. Write it up. Move on.",
].join("\n\n");

// The same shape with the punctuation displaced into symbols instead: an operator standing in for a
// copula, glyph-marked list lines, and a line shouted in capitals. This is the middle severity tier,
// and it is the one that separates a de-punctuated document from a writer who simply keeps it short.
const DISPLACED = [
  "THE PIPELINE IS NOT SLOW BECAUSE THE MACHINES ARE SMALL.",
  "It is slow because nothing in it can be cached.",
  "Every stage rebuilds the world from nothing.",
  "Capability ≠ Authority.",
  "Determination ≠ Execution.",
  "The build system provides capability.",
  "It does not decide what may run.",
  "Each job receives only what it needs to finish:",
  "→ a scoped token\n→ a pinned toolchain\n→ one writable directory\n→ nothing else",
  "One job or ten thousand jobs the rule does not change.",
  "No job inherits the whole cache simply because the fleet grew.",
  "That does not make the build fast.",
  "It makes the build knowable.",
].join("\n\n");

export const fixtures: RuleFixtures = {
  ruleId: "discourse/staccato-register",
  positives: [
    {
      text: PLAIN,
      spanText: PLAIN,
      needsClauses: true,
      note: "12 of 13 paragraphs are one sentence and there is not a single comma in 15 sentences — the conjunction on its own",
    },
    {
      text: DISPLACED,
      spanText: DISPLACED,
      needsClauses: true,
      note: "same starvation and same layout, plus the symbols the punctuation turned into: ≠ as a copula, → as a list marker, a shouted opening line",
    },
  ],
  negatives: [
    {
      text:
        "The migration ran over a long weekend, and nobody outside the team noticed it happening. " +
        "We moved four tables at a time, then checked the row counts against the old database " +
        "before letting the next batch through.",
      note: "ordinary punctuated prose in one paragraph — fails both halves of the conjunction",
    },
    {
      text:
        "The road ran north.\n\nIt climbed for six miles and then it stopped climbing.\n\n" +
        "Snow lay in the ditches and the truck went slowly.",
      note:
        "starved of internal punctuation and laid out one sentence per paragraph, which is the " +
        "shape this rule is about — and far too short to support the claim. Under the size gates " +
        "(12 units, 10 paragraphs) it stays silent, which is the point: a register is a property " +
        "of a document, and three sentences are not one",
    },
  ],
};

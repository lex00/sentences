// Which rules actually tell you the text was generated.
//
// score.total weights a finding by SEVERITY, which is a statement about how confident a rule is in
// one instance. It says nothing about how much that rule firing tells you about the document, and
// those are different quantities. Measured, the gap is large enough to swamp the number:
//
//                                      corpus  baseline  separation
//   all 51 rules                         53.1      30.5      1.74x
//   the 19 rules below                   27.4       1.7     16.2x
//   the 10 that do not discriminate      25.6      28.1      0.91x
//
// The non-discriminating rules carry roughly half the corpus score and almost all of the baseline
// score, so the headline number is largely measuring the same thing in both columns. That is why
// adding 98 findings to the corpus in one release moved score.total by 2.9.
//
// HOW THE LIST WAS CHOSEN, and what it is not. A rule is here only if it clears three gates
// against a 39,793-word sample of the target register, with this repository's own documentation
// (9,142 words) as a hand-written control:
//
//   discriminating   absent from the control, or at least 3x its rate there
//   stable           fires in BOTH halves of the sample, not just one
//   enough volume    at least 3 occurrences, so no rule is picked on a coincidence
//
// Validated by holding out half the sample: a list derived from one half separates the other at
// 15.8x against 16.6x in-sample, a 5% drop. The separation is not an artifact of fitting.
//
// WHAT THIS IS NOT. One author's blog is not "AI prose". This list describes what distinguishes
// that sample from careful technical writing, and a different corpus would very likely move it.
// It is shipped as data, in one file, precisely so it can be replaced when someone measures a
// better one — and the three gates above are the method to re-run, not the answer to keep.
//
// Absent on purpose: rules/demo.ts's intensifier rule clears every gate and is excluded anyway,
// because registry.ts marks it for deletion once the real lexical rules land. A weighting that
// depends on a placeholder would break the day someone removes it.

// Rules whose findings count toward score.discriminative. Everything else scores zero there, which
// is not a judgement on the rule: em-dash density is a real tell and a useful thing to edit, it
// just does not separate a generated document from a carefully written one.
export const DISCRIMINATIVE_RULES: ReadonlySet<string> = new Set([
  // structural, cross-sentence — the strongest signals by a wide margin
  "reframe",
  "repetition/near-duplicate",
  "anaphora/repeated-opening",
  "discourse/conjunction-opener",
  "discourse/punchy-fragments",
  "syntactic/self-posed-question",
  "discourse/epistrophe",
  "discourse/countdown",
  "discourse/staccato-register",
  "claude/mirrored-clauses",
  "claude/sounds-like-claude",
  "false-range/from-to",
  // lexical, but assistant-register rather than ordinary vocabulary
  "claude-technical-vocabulary",
  "claude-discourse-markers",
  "claude-stock-frames",
  "claude/invitation",
  "excess-vocabulary",
  "lex-magic-adverbs",
  "dead-metaphor/rare-lemma",
]);

export const isDiscriminative = (ruleId: string): boolean => DISCRIMINATIVE_RULES.has(ruleId);

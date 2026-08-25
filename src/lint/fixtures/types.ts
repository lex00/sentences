// The fixture contract for issue #12's per-rule battery. A fixture module is plain data — one file
// per rule id, living next to this one, exporting a single `fixtures: RuleFixtures`. The harness
// (../fixture-battery.test.ts) is the only thing that reads these; nothing else imports this
// directory at runtime.
//
// Spans are expressed as substrings rather than offsets so a fixture reads like prose and survives
// a rewording of the surrounding sentence: `spanText: "very"` plus `nth` (which occurrence, 1-based,
// default 1) tells the harness exactly what the rule's Finding.span must slice out of `text` —
// see stub-doc's spanOf, which the harness resolves this through.

// FORMAT EXTENSION (retrofit round, refs #12): a handful of lexical rules gate an entry on
// WordSpan.pos (posGate: "noun"/"verb"/"adverb" — see lexicons/types.ts and rules/lexical.ts).
// Neither of the fixture battery's two doc-builders ever fills `pos` (makeDoc never does, and
// buildDocAnalysis mirrors it deliberately — see build-doc.ts) — that's not a gap in this fixture
// format, it's the same "fails closed with no POS evidence" behavior those rules' own unit tests
// pin (see lexical.test.ts's "fails closed under the stub tokenizer" cases). To fixture the case
// where POS evidence IS present without inventing a third doc-builder, `posOverrides` patches
// `.pos` onto every word in the built doc whose text matches a key, case-insensitively — the same
// technique lexical.test.ts's own `docWithPos` helper uses, just applied on top of the normal word
// scan instead of replacing it. Omit it and the fixture exercises the fails-closed path instead.
export type PosOverrides = Readonly<Record<string, string>>;

export type PositiveFixture = {
  text: string; // input the rule MUST fire on
  spanText: string; // exact substring the rule's finding span must match (see nth)
  nth?: number; // which occurrence of spanText in text, 1-based (default 1)
  note?: string; // why this is a positive, for the human reading the fixture and the failure output
  // Build the doc through document.ts's readDocument (real rule-based parse, so unit.clauses is
  // populated) instead of the parser-free makeDoc stub. Only syntactic rules that read .clauses
  // need this; leave it off for lexical/formatting/discourse fixtures.
  needsClauses?: boolean;
  posOverrides?: PosOverrides; // see the FORMAT EXTENSION comment above
};

export type NegativeFixture = {
  text: string; // input the rule MUST NOT fire on — a near-miss, not just unrelated prose
  note?: string; // what makes this look like a positive without being one
  needsClauses?: boolean;
  posOverrides?: PosOverrides;
};

export type RuleFixtures = {
  ruleId: string; // must equal the TropeRule.id this fixture set exercises
  positives: readonly PositiveFixture[];
  negatives: readonly NegativeFixture[];
};

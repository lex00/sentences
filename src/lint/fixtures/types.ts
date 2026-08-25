// The fixture contract for issue #12's per-rule battery. A fixture module is plain data — one file
// per rule id, living next to this one, exporting a single `fixtures: RuleFixtures`. The harness
// (../fixture-battery.test.ts) is the only thing that reads these; nothing else imports this
// directory at runtime.
//
// Spans are expressed as substrings rather than offsets so a fixture reads like prose and survives
// a rewording of the surrounding sentence: `spanText: "very"` plus `nth` (which occurrence, 1-based,
// default 1) tells the harness exactly what the rule's Finding.span must slice out of `text` —
// see stub-doc's spanOf, which the harness resolves this through.

export type PositiveFixture = {
  text: string; // input the rule MUST fire on
  spanText: string; // exact substring the rule's finding span must match (see nth)
  nth?: number; // which occurrence of spanText in text, 1-based (default 1)
  note?: string; // why this is a positive, for the human reading the fixture and the failure output
  // Build the doc through document.ts's readDocument (real rule-based parse, so unit.clauses is
  // populated) instead of the parser-free makeDoc stub. Only syntactic rules that read .clauses
  // need this; leave it off for lexical/formatting/discourse fixtures.
  needsClauses?: boolean;
};

export type NegativeFixture = {
  text: string; // input the rule MUST NOT fire on — a near-miss, not just unrelated prose
  note?: string; // what makes this look like a positive without being one
  needsClauses?: boolean;
};

export type RuleFixtures = {
  ruleId: string; // must equal the TropeRule.id this fixture set exercises
  positives: readonly PositiveFixture[];
  negatives: readonly NegativeFixture[];
};

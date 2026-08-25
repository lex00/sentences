// The rule registry: one array, in the order findings are attributed when two rules tie, plus the
// per-rule on/off the app's toggles (#25) read and write.
//
// Adding a rule is two lines — import it, append it to RULES. Keep the array grouped by tier and
// alphabetical inside a tier, so a merge between two wave-3 branches conflicts on one line instead
// of reordering the file.

import type { TropeRule } from "./types.js";
import { demoIntensifierRule } from "./rules/demo.js";
import { deadMetaphorRule } from "./rules/dead-metaphor.js";
import { dilutionRule, nearDuplicateRule } from "./rules/repetition.js";

export const RULES: readonly TropeRule[] = [
  // --- lexical ---
  demoIntensifierRule, // DEMO — delete once the first real lexical rule lands (see rules/demo.ts)
  // --- syntactic ---
  // --- formatting ---
  // --- discourse ---
  deadMetaphorRule,
  dilutionRule,
  nearDuplicateRule,
];

// Two rules sharing an id would make findings indistinguishable and dedupe against each other.
// Checked at import time so a collision between wave-3 branches fails the first test that runs,
// naming the id, instead of quietly halving someone's findings.
export function assertUniqueRuleIds(rules: readonly TropeRule[] = RULES): void {
  const seen = new Set<string>();
  for (const r of rules) {
    if (seen.has(r.id)) throw new Error(`duplicate rule id: ${r.id}`);
    seen.add(r.id);
  }
}
assertUniqueRuleIds(RULES);

// Saved per-rule preferences, keyed by rule id. Absent means on: a rule added after the user's
// prefs were stored is enabled by default, and an id for a rule that no longer exists is ignored
// rather than throwing, so stale settings never break a run.
export type RuleToggles = Readonly<Record<string, boolean>>;

export const enabledRules = (toggles: RuleToggles = {}, rules: readonly TropeRule[] = RULES): TropeRule[] =>
  rules.filter((r) => toggles[r.id] !== false);

export const getRule = (id: string, rules: readonly TropeRule[] = RULES): TropeRule | undefined =>
  rules.find((r) => r.id === id);

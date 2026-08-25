// Which fixer handles which rule. This is deliberately NOT src/lint/registry.ts: a rule that can
// find a tell and a fixer that can safely remove one are different pieces of work, most rules will
// never have a fixer, and wave-3 branches adding rules should not have to merge against this file.
//
// Adding a fixer is one line. The key must be a rule id that exists — assertFixersHaveRules() is
// what catches a fixer keyed on a typo'd or deleted rule.

import type { TropeRule } from "../types.js";
import { RULES } from "../registry.js";
import type { FixProvider, Fixer } from "./types.js";
import { demoIntensifierFixer } from "./fixers/demo.js";

export const FIXERS: Readonly<Record<string, Fixer>> = {
  "demo/intensifier": demoIntensifierFixer, // DEMO — goes when rules/demo.ts goes
};

export const fixerFor = (ruleId: string, fixers: Readonly<Record<string, Fixer>> = FIXERS): Fixer | undefined =>
  fixers[ruleId];

// Findings from a rule with no fixer come back null, which the loop reads as "leave it alone and
// tell the reader about it" — the default for every rule until #24 gives it a fixer.
export const providerFrom =
  (fixers: Readonly<Record<string, Fixer>> = FIXERS): FixProvider =>
  (finding, doc) =>
    fixers[finding.ruleId]?.(finding, doc) ?? null;

export const defaultProvider: FixProvider = providerFrom();

export function assertFixersHaveRules(
  fixers: Readonly<Record<string, Fixer>> = FIXERS,
  rules: readonly TropeRule[] = RULES,
): void {
  const ids = new Set(rules.map((r) => r.id));
  for (const id of Object.keys(fixers)) {
    if (!ids.has(id)) throw new Error(`fixer registered for unknown rule id: ${id}`);
  }
}

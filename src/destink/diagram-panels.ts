// Stable identity for a finding's "show me" diagram panel, so an open panel survives a re-lint.
// Array position is NOT stable across a re-lint: toggling a rule, or the neural pass replacing the
// rule-based DocAnalysis with a richer one, can reorder, add, or remove findings (main.ts's
// renderAll re-runs runRules from scratch each time). Tracking "which panels are open" by index
// would silently reopen the wrong finding's diagram — or fail to reopen the one the reader had
// open — so this reuses the identity runRules already dedupes findings on and fixLoop already
// tracks fixes by: ruleId + span (see lint/fix/types.ts's FindingId, and engine.ts's dedupeKey,
// which is the same pair for the same reason).

import { idOf, keyOf } from "../lint/fix/index.js";
import type { Finding } from "../lint/types.js";

export const findingKey = (f: Finding): string => keyOf(idOf(f));

// Which indices into the CURRENT `findings` were previously open, matched by stable key rather
// than position. main.ts calls this once per re-lint and passes the result to renderFindingsList
// so it can draw those panels immediately instead of waiting for another click.
export function openIndices(findings: readonly Finding[], openKeys: ReadonlySet<string>): number[] {
  const out: number[] = [];
  findings.forEach((f, i) => {
    if (openKeys.has(findingKey(f))) out.push(i);
  });
  return out;
}

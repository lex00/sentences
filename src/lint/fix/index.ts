// The fixer framework's public surface, so callers import from src/lint/fix/ and not from four
// files inside it.

export type { FindingId, Fix, FixProvider, Fixer, TextEdit } from "./types.js";
export { REPAIR_AFFIX, SEAM_CHARS, findingKey, idOf, isValidRepair, keyOf, repairCore } from "./types.js";

export type { Splice } from "./apply.js";
export { applyEdits, applySplices, remapId, remapOffset, remapSpan, splicesFor, validateFix } from "./apply.js";

export type { FixLoopOptions, FixLoopResult, FixStep, RejectedFix } from "./loop.js";
export { DEFAULT_MAX_ITERATIONS, fixLoop, remapThrough } from "./loop.js";

export { FIXERS, assertFixersHaveRules, defaultProvider, fixerFor, providerFrom } from "./registry.js";

// Fixes a human chooses between rather than the loop applying (#24, for #25's UI). Everything else
// in src/lint/fix/fixers/ reaches callers through the registry; these two do not, because neither is
// a decision an autonomous loop is allowed to make on its own.
export { reframeProposals } from "./fixers/reframe.js";
export { tricolonProposalCount, tricolonProposals } from "./fixers/tricolon.js";

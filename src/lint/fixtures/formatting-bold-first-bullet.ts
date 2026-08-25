// Fixtures for rules/formatting.ts's boldFirstBulletRule — mined from formatting.test.ts.

import type { RuleFixtures } from "./types.js";

const fullyBold = [
  "- **Security**: environment-based configuration",
  "- **Performance**: lazy loading of expensive resources",
  "- **Reliability**: automatic retries with backoff",
].join("\n");

// Ordered ("1./2./3.") rather than "-" bullets on purpose: markdown.ts treats both as list items
// equally, but a 3-item "-"-bulleted list, read through the parser-free makeDoc, gives every item
// the same first "word" token ("-") — a real, if narrow, anaphora/repeated-opening false positive
// this fixture sidesteps rather than trips (see this file's note in the retrofit report).
const oneBold = [
  "1. **Security**: environment-based configuration",
  "2. Handles retries automatically",
  "3. Ships with sane defaults out of the box",
].join("\n");

const tooFew = ["- **One**: first", "- **Two**: second"].join("\n");

export const fixtures: RuleFixtures = {
  ruleId: "formatting/bold-first-bullet",
  positives: [{ text: fullyBold, spanText: fullyBold, note: "3/3 items open with **bold**, whole list is the span" }],
  negatives: [
    { text: oneBold, note: "only 1/3 items bold — under the 60% threshold" },
    { text: tooFew, note: "fewer than 3 items — MIN_LIST_ITEMS not met" },
  ],
};

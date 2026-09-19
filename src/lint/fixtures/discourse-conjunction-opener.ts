// Fixtures for discourse/conjunction-opener. Every claim here is about a RATE, so all of them are
// rate fixtures: the rule says nothing about any single sentence, only about how many of them open
// this way. Threshold measured at 3% of sentences, above the maximum seen in any hand-written
// document in this repository (2.3%).

import type { RuleFixtures } from "./types.js";

// 16 sentences, 4 of them opening on a bare conjunction: 25%, well over the floor.
const DENSE = [
  "The parser reads the input and resolves every name it finds.",
  "And the layout engine draws what comes back.",
  "The export path writes an SVG that opens anywhere.",
  "But the model weights are a build artifact and are not committed.",
  "The rule engine runs every rule over the whole document.",
  "So the density thresholds live inside each rule.",
  "The report is versioned and its key order is pinned.",
  "And two runs over the same input are byte-identical.",
  "The scorer weights each finding by severity.",
  "The fixer only ever deletes the author's own words.",
  "The loop re-lints after every step it takes.",
  "The app renders a diagram beside each finding.",
  "The CLI reads one file and writes nothing back.",
  "The server speaks JSON-RPC over stdio.",
  "The tests cover every registered rule.",
  "The battery checks each fixture at three levels.",
].join(" ");

// The same sentences with each conjunction folded into what it continues. Varied deliberately: a
// single replacement phrase would make four sentences open identically, which is anaphora, and the
// battery's cross-rule check would rightly fire on it.
const CLEAN = DENSE
  .replace("And the layout engine draws", "A layout engine then draws")
  .replace("But the model weights are", "Model weights remain")
  .replace("So the density thresholds live", "Density thresholds therefore live")
  .replace("And two runs over", "Two runs over");

export const fixtures: RuleFixtures = {
  ruleId: "discourse/conjunction-opener",
  positives: [
    {
      text: DENSE,
      spanText: "And the layout engine draws what comes back.",
      profile: "rate",
      note: "4 of 16 sentences open on a bare conjunction, 25% against a 3% floor",
    },
  ],
  negatives: [
    {
      text: CLEAN,
      note: "the same sentences with every conjunction folded into what it continues; a structural claim, true at every level",
    },
    {
      text: "The parser reads the input. And the layout draws it.",
      profile: "rate",
      note: "one opener in a two-sentence document: over the percentage, under the absolute floor and the length gate",
    },
  ],
};

// Fixtures for rules/tricolon-series.ts ("tricolon/comma-series"), the parser-free comma-list
// tricolon. The first two positives are the series from the LinkedIn-shaped post that motivated
// #34's recall round, reworded off the real names; they are exactly the shape tricolon.ts's IR path
// cannot see (its own fixture file records "She bought apples, bananas, and cherries." as a
// negative because the rule-based chunker never builds a Compound out of a comma list).
//
// The fixtures run through makeDoc (no needsClauses): this rule reads text, not clauses, and the
// stub builder is the honest test of the no-model path it exists to cover.
//
// Note what the spans cover. The first item is everything before the first comma, sentence opening
// included ("The rollout covered logging, …"), because no parser-free split can say where a series
// actually begins — see the rule's file header.

import type { RuleFixtures } from "./types.js";

export const fixtures: RuleFixtures = {
  ruleId: "tricolon/comma-series",
  positives: [
    {
      text: "The pitch is for an engineering-first security model: one where security teams contribute code, iterate alongside engineering, and help build the guardrails from day one.",
      spanText: "one where security teams contribute code, iterate alongside engineering, and help build the guardrails from day one",
      note: "Oxford-comma series of verb phrases — the motivating post's middle sentence, reworded",
    },
    {
      text: "Her advice: automate everything you safely can, keep humans in the loop only where risk demands it, and bake governance into the design phase, not the end of the pipeline.",
      spanText: "automate everything you safely can, keep humans in the loop only where risk demands it, and bake governance into the design phase",
      note: "the series stops at the coordinated item — the trailing ', not …' belongs to claude/contrast-tail, not here",
    },
    {
      text: "Hire quickly, train carefully and ship on time.",
      spanText: "Hire quickly, train carefully and ship on time",
      note: "no Oxford comma — the coordinator sits inside the final comma segment, which holds the last two items",
    },
    {
      text: "I came here, I saw the whole mess, and I fixed the build.",
      spanText: "I came here, I saw the whole mess, and I fixed the build",
      note: "a comma splice of three short clauses is a tricolon and should fire",
    },
    {
      text: "The rollout covered logging, alerting, tracing, dashboards, and paging.",
      spanText: "The rollout covered logging, alerting, tracing, dashboards, and paging",
      note: "five items — past a tricolon and into inventory, so the bare-noun guard is waived",
    },
  ],
  negatives: [
    {
      text: "The team shipped the parser and the renderer on Tuesday.",
      note: "two coordinated items, no comma series at all",
    },
    {
      text: "She bought apples, bananas, and cherries.",
      note: "three single-word items — a bare enumeration, not the parallel-phrase rhythm the rule keys on",
    },
    {
      text: "The contract was signed on May 1, 2024, and filed the same week.",
      note: "the comma inside a date must not manufacture an item — an item with no letter in it never counts",
    },
    {
      text: "Because the cache had gone stale after a long weekend of unattended traffic, the whole request path slowed to a crawl for every customer in the region, and the on-call engineer spent four hours chasing it.",
      note: "long clauses, not list items — the per-item word cap keeps a two-clause sentence out",
    },
  ],
};

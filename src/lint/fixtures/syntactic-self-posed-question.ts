// Fixtures for rules/self-posed-question.ts (selfPosedQuestionRule) — mined from
// self-posed-question.test.ts's acceptance examples.

import type { RuleFixtures } from "./types.js";

export const fixtures: RuleFixtures = {
  ruleId: "syntactic/self-posed-question",
  positives: [
    {
      text: "The result? Devastating.",
      spanText: "The result? Devastating",
      needsClauses: true,
      note: "strong form through the real document splitter — '?' excluded from both unit spans",
    },
  ],
  negatives: [
    {
      text: "This one here right now? Sure thing.",
      note: "weak form, single instance — a real question briefly answered once is not yet a pattern",
    },
    {
      text: "What is dependency injection? It is a design pattern where an object receives its dependencies " +
        "from an external source rather than creating them itself, which makes testing far easier.",
      needsClauses: true,
      note: "a real question answered at length (FAQ prose) never fires, even alone",
    },
  ],
};

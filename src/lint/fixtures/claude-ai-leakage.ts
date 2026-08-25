// Fixtures for claude/ai-leakage (rules/ai-leakage.ts, issue #34). See fixtures/demo-intensifier.ts
// for the format this follows.

import type { RuleFixtures } from "./types.js";

export const fixtures: RuleFixtures = {
  ruleId: "claude/ai-leakage",
  positives: [
    {
      text: "The model answered the question oaicite:0 with confidence.",
      spanText: "oaicite",
      note: "family A — a leaked citation-tag artifact, single hit fires at high",
    },
    {
      text: "I hope this helps with your project.",
      spanText: "I hope this helps",
      note: "family B — a sign-off closer a human could plausibly write, so it scores medium (not tested here, see ai-leakage.test.ts)",
    },
    {
      text: "As of my last knowledge update, the treaty had not been ratified.",
      spanText: "As of my last knowledge update",
      note: "family B — knowledge-cutoff disclosure; the longer phrase wins over the shorter "
        + "\"my last knowledge update\" it contains (overlap cleanup keeps the outer match)",
    },
    {
      text: "One reviewer noted that the phrase \"as an AI language model\" is a classic tell.",
      spanText: "as an AI language model",
      note:
        "documented decision (#34): a quoted mention discussing AI detection still fires — the " +
        "linter flags the string, the author decides whether it's actually a problem in context",
    },
    {
      text: "Share this: https://example.com/post?utm_source=chatgpt.com&utm_medium=referral",
      spanText: "utm_source=",
      note: "family A — a tracking parameter, but only because it sits inside a URL",
    },
    {
      text: "The result 【6†source】 was cited.",
      spanText: "【",
      note: "family A — a lenticular bracket left over from a citation renderer",
    },
  ],
  negatives: [
    {
      text: "Share this link: https://example.com/newsletter",
      note:
        "a plain URL with no utm_source — a query-string URL isn't used here because stub-doc " +
        "(the fixture battery's parser-free doc builder) splits sentences on any \"?\", including " +
        "one inside a URL, which is a stub-doc quirk unrelated to this rule",
    },
    {
      text: "The tracking parameter utm_source=chatgpt.com only matters when it's part of a link.",
      note: "\"utm_source=\" mentioned in prose, not inside a URL — the artifact only counts inside a URL",
    },
    {
      text: "Absolutely, this will take some time.",
      note:
        "a reply-opener-shaped word with no \"here is/are\" following it — not the phrase this rule " +
        "looks for (avoids \"certainly\", which is a real hit for lex-delve-family and would fail " +
        "this fixture's own cross-rule-precision check)",
    },
    {
      text: "Here is the report you requested.",
      note: "\"here is\" alone, with no \"certainly,\" prefix — not the reply-opener phrase",
    },
    {
      text: "The dog chased the ball across the yard.",
      note: "clean prose, nothing from either family",
    },
    {
      text: ["prose before", "```", "// I hope this helps future maintainers", "```", "prose after"].join("\n"),
      note: "family B boilerplate inside a fenced code block is suppressed entirely, not just downgraded",
    },
  ],
};

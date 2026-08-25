// Fixtures for lexicons/claude-technical-vocabulary.ts, via rules/claude-lexicon.ts's
// claudeTechnicalVocabularyRule. Single-hit-fires-visibly is the whole point of this lexicon (see
// that rule's header), so most positives are a single occurrence in an otherwise clean sentence —
// unlike the generic lexical tier's fixtures, there's no below-threshold step-down to demonstrate.
// "load-bearing" is intentionally absent here: its literal-sense gate lives in
// rules/claude-figurative.ts and is fixtured in fixtures/claude-figurative-suffixes.ts instead.

import type { RuleFixtures } from "./types.js";

export const fixtures: RuleFixtures = {
  ruleId: "claude-technical-vocabulary",
  positives: [
    {
      text: "It's worth stating plainly that this migration breaks the API.",
      spanText: "worth stating plainly",
      note: "high tier, pinned severity, fires alone",
    },
    { text: "This queue is battle-tested at scale.", spanText: "battle-tested", note: "medium tier, single word" },
    { text: "Retrying forever here is a footgun.", spanText: "footgun", note: "medium tier, single word" },
    {
      text: "There's an escape hatch for advanced users.",
      spanText: "escape hatch",
      note: "medium tier, two-word phrase, figurative sense",
    },
    { text: "The happy path works, but nothing else does.", spanText: "happy path", note: "medium tier phrase" },
    {
      text: "Deleting that config has a huge blast radius.",
      spanText: "blast radius",
      note: "medium tier, figurative sense",
    },
    { text: "Dark mode is table stakes now.", spanText: "table stakes", note: "medium tier phrase" },
    { text: "Our north star is developer trust.", spanText: "north star", note: "medium tier, figurative sense" },
    {
      text: "The config file is the single source of truth for this service.",
      spanText: "single source of truth",
      note: "medium tier, four-word phrase",
    },
    { text: "That's a paper cut, not a blocker.", spanText: "paper cut", note: "medium tier, singular form" },
    { text: "Users keep hitting the same paper cuts.", spanText: "paper cuts", note: "medium tier, plural form is a separate entry" },
    { text: "The onboarding flow still has sharp edges.", spanText: "sharp edges", note: "medium tier, figurative sense" },
    { text: "This API adds real cognitive load.", spanText: "cognitive load", note: "medium tier phrase" },
    { text: "Readers need one mental model for this.", spanText: "mental model", note: "medium tier phrase" },
    {
      text: "Errors are a first-class citizen in this design.",
      spanText: "first-class citizen",
      note: "medium tier, hyphenated head token stays one word",
    },
    { text: "The library ships batteries included.", spanText: "batteries included", note: "medium tier phrase" },
    { text: "These guardrails stop accidental deletes.", spanText: "guardrails", note: "low tier, pinned, still fires alone" },
    { text: "There are too many moving parts here.", spanText: "moving parts", note: "low tier, figurative sense" },
    { text: "The upgrade was seamless.", spanText: "seamless", note: "low tier" },
    { text: "It failed over seamlessly.", spanText: "seamlessly", note: "low tier" },
    { text: "This client library is performant.", spanText: "performant", note: "low tier" },
    { text: "Write idiomatic Go, not translated Java.", spanText: "idiomatic", note: "low tier" },
    { text: "This linter is deliberately opinionated.", spanText: "opinionated", note: "low tier" },
    { text: "The team stayed principled about scope.", spanText: "principled", note: "low tier" },
    { text: "Ship the pragmatic fix first.", spanText: "pragmatic", note: "low tier" },
    { text: "These hooks are composable.", spanText: "composable", note: "low tier" },
    { text: "The API's ergonomics need work.", spanText: "ergonomics", note: "low tier" },
    { text: "That's a more ergonomic signature.", spanText: "ergonomic", note: "low tier" },
    { text: "The button has no affordance for dragging.", spanText: "affordance", note: "low tier" },
    { text: "This change has a small surface area.", spanText: "surface area", note: "low tier, figurative sense" },
    { text: "We picked a future-proof format.", spanText: "future-proof", note: "low tier, hyphenated single token" },
    { text: "That refactor is non-trivial.", spanText: "non-trivial", note: "low tier, hyphenated single token" },
    { text: "She meticulously documented every flag.", spanText: "meticulously", note: "low tier" },
    { text: "He thoughtfully split the migration in two.", spanText: "thoughtfully", note: "low tier" },
    { text: "The fallback degrades gracefully.", spanText: "gracefully", note: "low tier" },
    { text: "We need a holistic view of latency.", spanText: "holistic", note: "low tier" },
    { text: "The retry logic is orthogonal to caching.", spanText: "orthogonal", note: "low tier, figurative sense" },
    { text: "Let's flesh out the design doc.", spanText: "flesh out", note: "low tier phrase" },
    { text: "We should round out the test suite.", spanText: "round out", note: "low tier phrase" },
    { text: "Someone still needs to wire up the webhook.", spanText: "wire up", note: "low tier phrase" },
    { text: "The flag has to thread through three layers.", spanText: "thread through", note: "low tier phrase" },
    { text: "The setting has to plumb through the config loader.", spanText: "plumb through", note: "low tier phrase" },
    { text: "This design is spiritually a monorepo.", spanText: "spiritually", note: "low tier" },
    { text: "The two configs are morally equivalent.", spanText: "morally equivalent", note: "low tier phrase" },
    { text: "It works for every locale, modulo timezone bugs.", spanText: "modulo", note: "low tier, non-arithmetic sense" },
    {
      text: "This is battle-tested, but it's also a footgun with an escape hatch.",
      spanText: "escape hatch",
      note: "multiple medium-tier hits in one sentence — severity escalation itself is pinned down in claude-lexicon.test.ts",
    },
  ],
  negatives: [
    { text: "The dog chased the ball across the yard.", note: "clean prose, no lexicon words at all" },
    {
      text: "The API's robustness improved this year, and the walk was uneventful.",
      note: "no dev-idiolect words present",
    },
    {
      text: "She told a bedtime story about a star-shaped cookie.",
      note: "shared cross-file negative — no claude-technical-vocabulary entries here either",
    },
  ],
};

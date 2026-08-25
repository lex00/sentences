// Fixtures for claude-assistant-voice (lexicons/claude-assistant-voice.ts, rules/
// claude-assistant-voice.ts). The tier's design point is SINGLE-HIT firing — every positive below
// is one lone occurrence in otherwise clean prose, deliberately not padded with a second or third
// hit, because a below-threshold demotion (the generic lexical tier's behavior) does not apply here.
// Severity itself (pinned "high" for the absolutely-right family, pinned "low" for
// "production-ready", "medium" for everything else) is asserted directly against
// claudeAssistantVoiceRule in rules/claude-assistant-voice.test.ts — this file only carries the
// span-matching contract the fixture battery (#12) checks.
import type { RuleFixtures } from "./types.js";

export const fixtures: RuleFixtures = {
  ruleId: "claude-assistant-voice",
  positives: [
    {
      text: "You're absolutely right about the deploy window.",
      spanText: "You're absolutely right",
      note: "the canonical Claudeism (anthropics/claude-code#3382) fires alone, pinned high",
    },
    {
      text: "Great question about the migration timeline.",
      spanText: "Great question",
      note: "one lone hit at the lexicon's default (medium) severity still fires — no step-down",
    },
    {
      text: "Feel free to open a follow-up ticket if this breaks again.",
      spanText: "Feel free to",
      note: "service-desk phrasing leaking into a written note",
    },
    {
      text: "The auth service is production-ready after this patch.",
      spanText: "production-ready",
      note: "single hyphenated token, pinned low — dev-legit phrase, still worth a quiet flag",
    },
    {
      text: "There's no one-size-fits-all setting for retry backoff.",
      spanText: "There's no one-size-fits-all",
      note: "three-token phrase spanning a hyphen-compound tail token",
    },
    {
      text: "This matters because the migration touches billing data.",
      spanText: "This matters because",
      note: "significance-signaling opener",
    },
  ],
  negatives: [
    {
      text: "You're right about the release date.",
      note: "no \"absolutely\" between the subject and \"right\" — the entry is the full three-token phrase, not just \"you're right\"",
    },
    {
      text: "She was absolutely right to leave early.",
      note: "\"was absolutely right\" isn't \"you're/you are absolutely right\" — the entry's first token is fixed to \"you're\"/\"you\", not any subject",
    },
    {
      text: "This is a reasonable starting point for the schema.",
      note: "\"a reasonable starting point\" isn't in the good/solid/great family the lexicon lists",
    },
    {
      text: "It was a great day for a hike.",
      note: "\"great\" alone, with neither \"question\" nor \"catch\" nor \"point\" following, isn't a trigger",
    },
    {
      text: "The team shipped the feature on Tuesday.",
      note: "clean prose, no assistant-voice phrases at all",
    },
  ],
};

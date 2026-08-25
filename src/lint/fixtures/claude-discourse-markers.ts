// Fixtures for claude-discourse-markers (lexicons/claude-discourse-markers.ts, rules/
// claude-discourse-markers.ts). Same single-hit design point as claude-assistant-voice.ts's
// fixtures: every positive is one lone occurrence, and severity escalation (low -> medium once the
// document racks up 3 hits from this lexicon) is asserted directly in
// rules/claude-discourse-markers.test.ts, not here.
//
// Documented stance (see the file header on claude-discourse-markers.ts and #34's fixture ask):
// "in other words" still fires when it's being discussed rather than used as a live transition
// ("...in other words, a phrase that softens a claim" while talking ABOUT hedging). This rule
// matches at the token level and has no way to distinguish mention from use — that is a known,
// accepted limitation of every lexicon in this tier, not special-cased away, so it is fixtured as a
// POSITIVE rather than papered over as a negative.
import type { RuleFixtures } from "./types.js";

export const fixtures: RuleFixtures = {
  ruleId: "claude-discourse-markers",
  positives: [
    {
      text: "The key insight is that retries mask the real failure.",
      spanText: "The key insight is",
      note: "one lone hit at the lexicon's default (low) severity still fires — no step-down",
    },
    {
      text: "The paper calls this hedging: in other words, a phrase that softens a claim.",
      spanText: "in other words",
      note: "fires even while the phrase is being discussed rather than used as a transition — see file header",
    },
    {
      text: "Net-net, the caching layer paid for itself in a week.",
      spanText: "Net-net",
      note: "single hyphen-compound token, case preserved in the matched span",
    },
    {
      text: "This edge case is worth flagging before the release.",
      spanText: "worth flagging",
    },
    {
      text: "TLDR, the outage was caused by a stale cache key.",
      spanText: "TLDR",
      note: "matches the no-punctuation spelling of tl;dr — the literal \"tl;dr\" can't be matched, see the lexicon file header",
    },
    {
      text: "At a high level, the pipeline retries before failing over.",
      spanText: "At a high level",
    },
    {
      text: "Instead of fighting the constraint, the team decided to lean into it.",
      spanText: "lean into",
      note: "claudisms.ai (CC0) addition — the physical-action metaphor for \"focus on\"",
    },
  ],
  negatives: [
    {
      text: "The key insight from the postmortem was buried in appendix B.",
      note: "\"insight from\", not \"insight is\" — the fourth token of the entry never arrives",
    },
    {
      text: "The foundation used concrete poured last spring.",
      note: "\"concrete\" the material isn't \"concretely\" the adverb — no shared token, no lemma flag on this entry",
    },
    {
      text: "This magic trick fooled the whole audience.",
      note: "\"trick\" with neither a leading \"the\" nor a trailing \"is\" doesn't complete the phrase",
    },
    {
      text: "The team migrated the database over the weekend without incident.",
      note: "clean prose, no discourse-marker phrases at all",
    },
  ],
};

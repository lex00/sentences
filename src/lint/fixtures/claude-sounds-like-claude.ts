// Fixtures for rules/sounds-like-claude.ts (issue #34's capstone). The finding's span is always the
// whole document ({start:0, end:text.length}), same convention as repetition-dilution.ts's
// fixtures: spanText is set to the fixture's entire text, which the exact-substring match already
// covers for the [0, length) case — no format extension needed.
//
// NOTE on what does NOT live here: a "dense in one family only" negative is deliberately absent.
// The fixture battery's cross-rule check requires EVERY registered rule (not just this one) to stay
// silent on every negative in the whole suite — so a negative dense enough in one claude-* family
// to matter would necessarily also trip that family's own real rule, which is correct behavior for
// that rule and would fail the battery for an unrelated reason. That scenario is covered instead in
// rules/sounds-like-claude.test.ts, calling this rule's detect() directly, bypassing the
// all-rules-must-be-silent constraint this file's negatives are held to.
import type { RuleFixtures } from "./types.js";

// Four DISTINCT claude-* families, one hit each: claude-technical-vocabulary ("footgun"),
// claude-assistant-voice ("feel free to"), claude-discourse-markers ("at a high level"),
// claude-fiction-frames ("something else entirely"). Meets CO_OCCURRENCE_THRESHOLD (4) exactly.
const FOUR_FAMILIES = [
  "Our retry logic is a footgun waiting to happen.",
  "Feel free to disable it if that's simpler.",
  "At a high level, the system retries before failing over.",
  "When the outage hit, something else entirely broke downstream.",
].join(" ");

export const fixtures: RuleFixtures = {
  ruleId: "claude/sounds-like-claude",
  positives: [
    {
      text: FOUR_FAMILIES,
      spanText: FOUR_FAMILIES,
      note: "4 distinct families each fire once (technical vocab, assistant voice, discourse markers, fiction frames) — meets the co-occurrence threshold",
    },
  ],
  negatives: [
    {
      text: "The team migrated the database over a long weekend without any customer-visible downtime.",
      note: "clean prose, no claude-isms of any family",
    },
    {
      text: "The parser reads the source text before anything else happens, then a checker validates every declared type.",
      note: "ordinary technical prose, no claude-isms of any family",
    },
  ],
};

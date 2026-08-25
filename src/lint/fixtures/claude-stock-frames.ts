// Fixtures for claude-stock-frames (lexicons/claude-stock-frames.ts, rules/claude-stock-frames.ts).
// Same single-hit design point as the other claude-lexicon-factory fixtures: every positive is one
// lone occurrence in otherwise clean prose (severity/escalation arithmetic is asserted directly in
// rules/claude-stock-frames.test.ts, not here — this file only carries the span-matching contract
// the fixture battery (#12) checks).
//
// The first three positives below share ONE text — a reworded version of the LinkedIn-style post
// that motivated this lexicon (issue #34: a real post scored near zero against the existing
// claude-* lexicons) — so that rules/claude-stock-frames.test.ts's "fires exactly 3 findings on the
// reworded sample" assertion and these three fixtures are checking the exact same sentence from two
// angles: aggregate count there, per-phrase span correctness here.
import type { RuleFixtures } from "./types.js";

const MOTIVATING_SAMPLE = "AI adoption isn't slowing down, and teams can't afford to stay on the sidelines.";

export const fixtures: RuleFixtures = {
  ruleId: "claude-stock-frames",
  positives: [
    {
      text: MOTIVATING_SAMPLE,
      spanText: "isn't slowing down",
      note: "urgency hook — one of 3 findings the motivating sample must produce (see rules/claude-stock-frames.test.ts)",
    },
    {
      text: MOTIVATING_SAMPLE,
      spanText: "can't afford to",
      note: "urgency hook — second of the motivating sample's 3 findings",
    },
    {
      text: MOTIVATING_SAMPLE,
      spanText: "stay on the sidelines",
      note: "urgency hook, literal-\"stay\" gated (see lexicon header) — third of the motivating sample's 3 findings",
    },
    {
      text: "This trend isn't going anywhere next quarter.",
      spanText: "isn't going anywhere",
    },
    {
      text: "This outage was a wake-up call for the whole org.",
      spanText: "wake-up call",
    },
    {
      text: "For this launch, the stakes couldn't be higher.",
      spanText: "the stakes couldn't be higher",
    },
    {
      text: "This shift matters because it changes who ships code.",
      spanText: "matters because",
      note: "generalized form of claude-assistant-voice's \"this matters because\" — see lexicon DEDUP header; fires alongside that rule on \"this matters because\", never on any of its negatives",
    },
    {
      text: "This report makes the case for remote work.",
      spanText: "makes the case for",
    },
    {
      text: "Even skeptics admit the case for caution is strong.",
      spanText: "the case for",
      note: "the weakest entry here by design — see lexicon header's note on this phrase",
    },
    {
      text: "This framework wasn't built for that scale.",
      spanText: "wasn't built for",
    },
    {
      text: "The API wasn't designed for this traffic pattern.",
      spanText: "wasn't designed for",
    },
    {
      text: "Teams are still adjusting to the pace it brings.",
      spanText: "the pace it brings",
    },
    {
      text: "Here's why that matters for your roadmap.",
      spanText: "Here's why that matters",
    },
    {
      text: "Security was a priority from day one.",
      spanText: "from day one",
    },
    {
      text: "The bug was only caught after the fact.",
      spanText: "after the fact",
    },
    {
      text: "The pipeline still keeps humans in the loop.",
      spanText: "humans in the loop",
    },
    {
      text: "The pipeline still keeps a human in the loop.",
      spanText: "human in the loop",
    },
    {
      text: "Accessibility was baked into the design.",
      spanText: "baked into",
    },
    {
      text: "Observability was built in from the start.",
      spanText: "built in from the start",
    },
    {
      text: "This is not optional, full stop.",
      spanText: "full stop",
    },
    {
      text: "The rollout failed, plain and simple.",
      spanText: "plain and simple",
    },
    {
      text: "Ship smaller batches, it's that simple.",
      spanText: "it's that simple",
    },
    {
      text: "Read the numbers again and let that sink in.",
      spanText: "let that sink in",
      note: "broetry closer, pinned medium",
    },
    {
      text: "If you doubt it, read that again.",
      spanText: "read that again",
      note: "broetry closer, pinned medium",
    },
    {
      text: "Honestly, most people won't read this far.",
      spanText: "most people won't read this far",
      note: "broetry closer, pinned medium",
    },
    {
      text: "Drop a comment if this resonates with you.",
      spanText: "if this resonates",
    },
    {
      text: "Smash like, repost if you agree.",
      spanText: "repost if",
      note: "broetry closer, pinned medium",
    },
  ],
  negatives: [
    {
      text: "The cake was baked in a pan for forty minutes.",
      note: "literal cooking sense of \"baked in\" — this lexicon deliberately has no bare \"baked in\" entry (only \"baked into\") specifically to dodge this collision; see lexicon header",
    },
    {
      text: "She sat on the sidelines during the match.",
      note: "the literal sports sense — no \"stay\" anywhere, so the idiom entry's first token never arrives; see lexicon header",
    },
    {
      text: "There's a strong argument for caution here.",
      note: "\"argument for\", not \"case for\" — the entry's middle token never arrives",
    },
    {
      text: "The market is slowing down for the holidays.",
      note: "positive polarity (\"is slowing down\") — the entry requires the negated \"isn't\"",
    },
    {
      text: "The stakes were fairly high going into the vote.",
      note: "\"stakes were... high\", not the fixed \"stakes couldn't be higher\" — different construction entirely",
    },
    {
      text: "The team shipped the feature on Tuesday without incident.",
      note: "clean prose, no stock-frame phrases at all",
    },
  ],
};

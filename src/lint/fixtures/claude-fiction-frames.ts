// Fixtures for lexicons/claude-fiction-frames.ts, via rules/claude-fiction.ts's
// claudeFictionFramesRule. This battery only checks fire/silence (see fixture-battery.test.ts) —
// the severity assertions ("single hit fires at medium", "three hits escalate to high") live in
// claude-fiction.test.ts instead, since RuleFixtures has no severity field to pin against.

import type { RuleFixtures } from "./types.js";

export const fixtures: RuleFixtures = {
  ruleId: "claude-fiction-frames",
  positives: [
    {
      text: "Her reply came barely above a whisper.",
      spanText: "barely above a whisper",
      note: "single hit fires at medium — no density floor to clear, per #34's single-hit-fires model",
    },
    { text: "It wasn't a betrayal. It was something else entirely.", spanText: "something else entirely" },
    {
      text: "His smile didn't reach his eyes when he agreed.",
      spanText: "smile didn't reach",
      note: "the two held-breath/eyes entries below can overlap this one; each is matched independently",
    },
    { text: "The eyes didn't reach her eyes, not really.", spanText: "didn't reach her eyes" },
    { text: "She let out a breath she didn't know she was holding.", spanText: "didn't know she was holding" },
    { text: "He let out a breath he didn't know he was holding.", spanText: "didn't know he was holding" },
    {
      text: "Somewhere in her chest, a breath she didn't know had been trapped finally escaped.",
      spanText: "a breath she didn't know",
    },
    { text: "She walked in confidently; little did she know how wrong she was.", spanText: "little did she know" },
    { text: "He smiled and shook hands; little did he know what waited for him.", spanText: "little did he know" },
    { text: "They waited, couldn't shake the feeling that something was off.", spanText: "couldn't shake the feeling" },
    { text: "The wait dragged on for what seemed like an eternity.", spanText: "for what seemed like an eternity" },
    { text: "By the time they arrived, the air was thick with unspoken accusations.", spanText: "the air was thick with" },
    { text: "The news sent shivers down her spine.", spanText: "sent shivers down" },
    { text: "The room fell quiet for a long moment before anyone spoke.", spanText: "quiet for a long moment" },
    { text: "She heard a sound like glass breaking somewhere below.", spanText: "a sound like" },
    { text: "He laughed, trying to sound casual about the whole thing.", spanText: "trying to sound casual" },
    { text: "He turned toward the window and something flickered across his expression.", spanText: "something flickered across" },
    { text: "The moment she spoke, something shifted in the room.", spanText: "something shifted in" },
    { text: "The old cabin had clearly seen better days.", spanText: "seen better days" },
    { text: "Her eyes gleamed with something unreadable.", spanText: "eyes gleamed with" },
    { text: "His knuckles whitened around the railing.", spanText: "knuckles whitened" },
    { text: "It was a mix of relief and dread.", spanText: "a mix of" },
  ],
  negatives: [
    {
      text: "The message barely got through the crowded room.",
      note: "'barely' present but not the fixed phrase 'barely above a whisper' (also avoids the sibling gesture lexicon's 'whisper' entry — see claude-fiction-gestures.ts)",
    },
    { text: "That was something else, but not entirely unexpected.", note: "'something else' and 'entirely' present but not contiguous" },
    { text: "The paint on the fence had clearly seen a lot of rain.", note: "'seen' present but not the fixed phrase 'seen better days'" },
    { text: "She knew exactly what she was doing the whole time.", note: "the opposite of the held-breath / little-did-she-know frames, no overlap" },
    { text: "The dog chased the ball across the yard.", note: "clean prose, no lexicon phrases at all" },
  ],
};

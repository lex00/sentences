// Fixtures for lexicons/claude-fiction-gestures.ts, via rules/claude-fiction.ts's
// claudeFictionGesturesRule. This battery only checks fire/silence (see fixture-battery.test.ts) —
// the severity assertions this lexicon most needs ("one gesture verb in a plain paragraph stays
// candidate, not silent"; "obsidian's literal-rock sense still fires, at candidate"; "five-plus
// hits escalate candidate to low") live in claude-fiction.test.ts instead, since RuleFixtures has
// no severity field. A plain-action paragraph with exactly one gesture verb is deliberately NOT a
// negative fixture here — per #34's single-hit-fires model it must fire (at candidate), so it
// cannot belong to a fixture type that asserts silence.

import type { RuleFixtures } from "./types.js";

export const fixtures: RuleFixtures = {
  ruleId: "claude-fiction-gestures",
  positives: [
    { text: "The candle flickered in the draft.", spanText: "flickered", note: "lemma:true base \"flicker\"" },
    { text: "She leaned against the doorway.", spanText: "leaned", note: "lemma:true base \"lean\"" },
    { text: "He blinked, unsure what to say.", spanText: "blinked", note: "lemma:true base \"blink\"" },
    { text: "He gestured toward the door.", spanText: "gestured", note: "lemma:true base \"gesture\"" },
    { text: "He grinned and gave a small nod.", spanText: "grinned", note: "consonant-doubling irregular, literal form" },
    { text: "She nodded once and left.", spanText: "nodded", note: "consonant-doubling irregular, literal form" },
    { text: "He hummed a quiet tune while he worked.", spanText: "hummed", note: "consonant-doubling irregular, literal form" },
    { text: "She murmured her thanks and walked away.", spanText: "murmured", note: "lemma:true base \"murmur\"" },
    { text: "He whispered a warning before the door shut.", spanText: "whispered", note: "lemma:true base \"whisper\"" },
    { text: "He glanced at his watch again.", spanText: "glanced", note: "lemma:true base \"glance\"" },
    { text: "He muttered something under his breath.", spanText: "muttered", note: "lemma:true base \"mutter\"" },
    { text: "She tilted her head in confusion.", spanText: "tilted", note: "lemma:true base \"tilt\"" },
    { text: "She flinched at the sudden noise.", spanText: "flinched", note: "lemma:true base \"flinch\"" },
    { text: "His hands were trembling by the end.", spanText: "trembling", note: "lemma:true base \"tremble\"" },
    { text: "His hands clutched the railing tightly.", spanText: "clutched", note: "lemma:true base \"clutch\"" },
    { text: "The engine hissed as it cooled.", spanText: "hissed", note: "lemma:true base \"hiss\"" },
    { text: "She breathed out slowly and counted to ten.", spanText: "breathed", note: "lemma:true base \"breathe\"" },
    { text: "The blade struck just below his sternum.", spanText: "sternum" },
    { text: "The room settled into stillness after the door closed.", spanText: "stillness" },
    { text: "He waited, unhurried, for her answer.", spanText: "unhurried" },
    {
      text: "The cave walls were lined with obsidian.",
      spanText: "obsidian",
      note: "literal-rock sense still fires (single hit, weakest severity) — see PRECISION CALL in the lexicon file",
    },
    { text: "It seemed impossibly bright after the dark hallway.", spanText: "impossibly" },
    { text: "The music played faintly from another room.", spanText: "faintly" },
    { text: "She paused momentarily before answering.", spanText: "momentarily" },
    {
      text: "He leaned back and blinked. She murmured something and glanced away. He tilted his head, and his hands trembled faintly.",
      spanText: "leaned",
      note: "gesture-dense paragraph (7 hits, past densityThreshold 5) — escalation severity checked in claude-fiction.test.ts",
    },
  ],
  negatives: [
    { text: "The dog chased the ball across the yard.", note: "clean prose, no gesture-cluster words at all" },
    { text: "The team finished the quarterly report ahead of schedule.", note: "clean prose, no gesture-cluster words at all" },
    { text: "The library added new titles to its catalog this spring.", note: "clean prose, no gesture-cluster words at all" },
    { text: "She remained unflinching under pressure.", note: "'flinch' lemma must not match inside 'unflinching' (word boundary)" },
  ],
};

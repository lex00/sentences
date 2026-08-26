// Behavior for rules/staccato-register.ts. The fixture battery (fixtures/staccato-register.ts)
// covers the basic fire/stay-silent shape; this file covers the two things that file cannot: the
// hard human negatives, which are too long to survive the battery's cross-rule check, and the
// severity ladder.
//
// THE TWO NEGATIVES ARE THE WHOLE ARGUMENT FOR THE CONJUNCTION, so they are pinned with their
// measured numbers rather than just an expectation of silence:
//
//   linkedinShaped   86% one-sentence paragraphs, 1.44 internal marks per sentence. Fails on
//                    punctuation. This is what a real person writing in line breaks looks like,
//                    and layout alone would flag it.
//   hemingwayShaped  0.00 internal marks per sentence, 0% one-sentence paragraphs. Fails on
//                    layout. This is issue #35's human-literary false positive: punctuation
//                    starvation alone flags it HARDER than it flags the de-punctuated post.
//
// If a future threshold change makes either of these fire, the rule has stopped measuring
// migration and started measuring taste.

import { describe, it, expect } from "vitest";
import { buildDocAnalysis } from "../build-doc.js";
import { staccatoRegisterRule, THRESHOLDS } from "./staccato-register.js";

const paras = (...p: string[]) => p.join("\n\n");

// ---------------------------------------------------------------------------------------------
// the hard negatives
// ---------------------------------------------------------------------------------------------

// A human post written in line breaks. Every paragraph is one sentence; every sentence keeps its
// commas.
const linkedinShaped = paras(
  "I got laid off on a Tuesday, which is a stupid day to get laid off.",
  "By Friday I had rewritten my resume four times, and none of the versions sounded like me.",
  "The first one was all verbs, the second was all numbers, and the third read like a job posting for someone I had never met.",
  "What actually worked, eventually, was something a friend told me over the phone while I stood in a parking lot in the rain.",
  "She said to stop listing what I was responsible for, and to start listing what broke when I was not there.",
  "So I did that, and the document got shorter, and for the first time it sounded like a person.",
  "I sent it to eleven places, heard back from three, and got two interviews out of it.",
  "The first interview was a disaster, mostly because I had rehearsed too much and could not stop performing.",
  "The second one, at a company I had almost not applied to, opened with a question I actually wanted to answer.",
  "We talked for an hour about a migration that went badly, and about what I would do differently.",
  "I start on Monday, and I am nervous in the way you are nervous about something you want.",
  "If you are sitting in a parking lot somewhere with a resume that sounds like a stranger, my inbox is open.",
  "It is not much, and it will not get you a job, but it is the thing I wish someone had offered me in March.",
);

// Terse declarative prose with no internal punctuation at all, grouped into paragraphs the way a
// person writing paragraphs groups them.
const hemingwayShaped = paras(
  "The road ran north. It climbed for six miles and then it stopped climbing. Snow lay in the ditches. The truck went slowly and the man did not talk.",
  "We came to the lake at four. The water was black and there was no wind on it. A dog barked somewhere behind the trees and then it stopped. Nothing else moved.",
  "He unloaded the boat and I carried the oars. The oars were heavy and one of them was cracked near the blade. He said it would hold. It held for three days and then it did not.",
  "In the evening we ate bread and cold meat. The fire smoked because the wood was wet. He told me about his brother. I had heard the story before but I let him tell it.",
  "The lake froze over in November that year. It froze early and it froze hard. Nobody expected it. The boat stayed where we left it and by spring the ice had taken the cracked oar.",
);

describe("discourse/staccato-register: the hard negatives", () => {
  it("stays silent on a human post written in one-sentence paragraphs that keeps its commas", () => {
    expect(staccatoRegisterRule.detect(buildDocAnalysis(linkedinShaped))).toHaveLength(0);
  });

  it("stays silent on terse prose with no internal punctuation but sentences grouped into paragraphs", () => {
    expect(staccatoRegisterRule.detect(buildDocAnalysis(hemingwayShaped))).toHaveLength(0);
  });

  it("the two negatives fail on OPPOSITE halves of the conjunction", () => {
    // Not a tautology restating the two cases above: it pins that each negative would have been a
    // POSITIVE under the other half alone, which is why neither half ships as a rule by itself.
    const marksPerUnit = (text: string) => {
      const doc = buildDocAnalysis(text);
      const units = doc.units.filter((u) => /[\p{L}\p{N}]/u.test(u.unit)).length;
      return (text.match(/[,;:()]|—|–|--/g) ?? []).length / units;
    };
    expect(marksPerUnit(linkedinShaped)).toBeGreaterThan(THRESHOLDS.INTERNAL_PER_UNIT_MAX);
    expect(marksPerUnit(hemingwayShaped)).toBeLessThan(THRESHOLDS.INTERNAL_PER_UNIT_MAX);
  });
});

// ---------------------------------------------------------------------------------------------
// the size gates
// ---------------------------------------------------------------------------------------------

const shortStaccato = paras(
  "The deploy failed again.",
  "Nobody knew why.",
  "The difference was the cache.",
  "That is the whole story.",
);

// The case the low floors actually risk, and the reason CORROBORATION exists. Seven sentences,
// seven one-sentence paragraphs, and not a single comma in the whole thing: this passes BOTH halves
// of the conjunction outright (100% solo, 0.00 marks per sentence — starved harder than the post
// that motivated the rule). It is a person writing plainly. Nothing here was avoided: no symbol
// standing in for a verb, no glyph markers, nothing shouted, fewer than two structural tropes. If
// this ever fires, the rule has become a complaint about short sentences.
const shortHumanStaccato = paras(
  "I quit my job in March.",
  "Nobody at the office was surprised.",
  "My manager took me for coffee and asked what took me so long.",
  "I did not have a good answer for him.",
  "The truth is I had been ready to go for about two years.",
  "It took me that long to admit it.",
  "My last day is Friday and I am going to miss the coffee.",
);

describe("discourse/staccato-register: size gates and corroboration", () => {
  it("stays silent below the floors, where there is not enough document to see a register at all", () => {
    const doc = buildDocAnalysis(shortStaccato);
    expect(doc.units.length).toBeLessThan(THRESHOLDS.MIN_UNITS);
    expect(staccatoRegisterRule.detect(doc)).toHaveLength(0);
  });

  it("stays silent on a short plain-spoken piece that passes BOTH halves of the conjunction", () => {
    const doc = buildDocAnalysis(shortHumanStaccato);
    // Pinned so the exclusion is provably about corroboration and not about the conjunction
    // quietly failing: this document is starved and solo by any measure the rule uses.
    const units = doc.units.filter((u) => /[\p{L}\p{N}]/u.test(u.unit)).length;
    expect((shortHumanStaccato.match(/[,;:()]|—|–|--/g) ?? []).length).toBe(0);
    expect(units).toBeGreaterThanOrEqual(THRESHOLDS.MIN_UNITS);
    expect(staccatoRegisterRule.detect(doc)).toHaveLength(0);
  });

  it("fires above the self-evident size with no corroboration at all", () => {
    const doc = buildDocAnalysis(paras(...BARE));
    expect(doc.units.length).toBeGreaterThanOrEqual(THRESHOLDS.SELF_EVIDENT_UNITS);
    expect(staccatoRegisterRule.detect(doc)).toHaveLength(1);
  });
});

describe("discourse/staccato-register: sensitivity", () => {
  // The complaint that set the floors: a reader calls this register in about five lines, and the
  // first draft of the rule (12 units, 10 paragraphs) stayed silent through eleven paragraphs of
  // the post it was written for. These are the post's opening paragraphs, in order.
  const opening = [
    "AI AGENTS ARE NOT FAILING BECAUSE THEY ARE NOT INTELLIGENT ENOUGH.",
    "They are failing because intelligence is being given too much authority.",
    "The numbers are becoming difficult to ignore.",
    "Only 15% report scaled, orchestrated, cross-functional multi-agent adoption.",
    "This is not primarily an intelligence problem.",
    "It is an architecture problem.",
  ];

  it("fires within the first six paragraphs of the post that motivated it", () => {
    const findings = staccatoRegisterRule.detect(buildDocAnalysis(paras(...opening)));
    expect(findings).toHaveLength(1);
  });

  it("is carried there by corroboration, not by density: the same six paragraphs unshouted stay clean", () => {
    const unshouted = [...opening];
    unshouted[0] = "AI agents are not failing because they are not intelligent enough.";
    expect(staccatoRegisterRule.detect(buildDocAnalysis(paras(...unshouted)))).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------------------------
// the severity ladder
// ---------------------------------------------------------------------------------------------

const BARE = [
  "The deploy failed again this morning.",
  "Nobody on the team knew why.",
  "We had shipped the same change on Friday without any trouble.",
  "The difference was the cache.",
  "It had been warm on Friday and it was cold today.",
  "That is the whole story.",
  "The dashboard shows the symptom.",
  "It does not show the cause.",
  "Every incident this quarter has ended the same way.",
  "Someone reads the diff by hand and finds it.",
  "The tooling could tell us and it does not.",
  "We have known this since April.",
  "Nothing has changed since April either.",
];

describe("discourse/staccato-register: severity ladder", () => {
  it("reports low for the register with nothing else: no symbols, no surviving tropes", () => {
    const findings = staccatoRegisterRule.detect(buildDocAnalysis(paras(...BARE)));
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe("low");
    expect(findings[0]!.explanation).not.toContain("symbol");
  });

  it("escalates to medium when the punctuation shows up displaced into symbols", () => {
    const withSymbols = paras(...BARE, "Capability ≠ Authority.", "Determination ≠ Execution.");
    const findings = staccatoRegisterRule.detect(buildDocAnalysis(withSymbols));
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe("medium");
    expect(findings[0]!.message).toMatch(/paragraphs are a single sentence/);
    expect(findings[0]!.explanation).toContain("2 lines using a symbol where a verb belongs");
  });

  it("counts glyph list markers and shouted lines as displacement too", () => {
    const withGlyphs = paras(
      "THE PIPELINE IS NOT SLOW BECAUSE THE MACHINES ARE SMALL.",
      ...BARE,
      "→ a scoped token\n→ a pinned toolchain\n→ one writable directory",
    );
    const findings = staccatoRegisterRule.detect(buildDocAnalysis(withGlyphs));
    expect(findings).toHaveLength(1);
    expect(findings[0]!.explanation).toContain("3 glyph-marked list lines");
    expect(findings[0]!.explanation).toContain("1 line shouted in capitals");
  });

  it("reports one document-spanning finding, never one per paragraph", () => {
    const doc = buildDocAnalysis(paras(...BARE));
    const findings = staccatoRegisterRule.detect(doc);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.span).toEqual({ start: 0, end: doc.text.length });
  });
});

// ---------------------------------------------------------------------------------------------
// the payload: the tells survived the scrub
// ---------------------------------------------------------------------------------------------

describe("discourse/staccato-register: surviving tropes", () => {
  // The de-punctuated post that motivated the rule, trimmed to its argument. Three structural
  // rules still fire on it (reframe, tricolon/comma-series, discourse/punchy-fragments) even
  // though every mark those rules used to key on has been deleted.
  const scrubbed = paras(
    "AI AGENTS ARE NOT FAILING BECAUSE THEY ARE NOT INTELLIGENT ENOUGH.",
    "They are failing because intelligence is being given too much authority.",
    "The numbers are becoming difficult to ignore.",
    "This is not primarily an intelligence problem.",
    "It is an architecture problem.",
    "We do not give an agent the intelligence, memory, authority and credentials of the wider system and then hope it behaves.",
    "The governing layer remains separate from the execution node.",
    "Determination ≠ Execution.\nCapability ≠ Authority.\nLLM ≠ Constitution.",
    "The model provides capability.",
    "It does not possess the authority governing that capability.",
    "One agent or one million agents the rule remains the same.",
    "No agent inherits global authority simply because the fleet grows.",
    "That does not make compromise impossible.",
    "It changes the blast radius.",
  );

  it("reports high, and names the rules that still fire, when the scrub left the tells behind", () => {
    const findings = staccatoRegisterRule.detect(buildDocAnalysis(scrubbed));
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe("high");
    expect(findings[0]!.explanation).toMatch(/the tells are all still here/);
    expect(findings[0]!.explanation).toMatch(/reframe/);
  });

  it("needs at least MIN_SURVIVORS of them: one alone does not reach high", () => {
    expect(THRESHOLDS.MIN_SURVIVORS).toBe(2);
    const findings = staccatoRegisterRule.detect(buildDocAnalysis(paras(...BARE)));
    expect(findings[0]!.severity).not.toBe("high");
  });
});

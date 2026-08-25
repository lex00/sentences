import { describe, it, expect } from "vitest";
import { tokenizeWords } from "../parser/model-parser.js";
import { tokenSpans, tokenizeWithSpans } from "./offsets.js";

// The acceptance property, stated once and then applied to everything below: slicing the ORIGINAL
// text by a word's span must reproduce that word's surface form exactly.
const roundTrips = (text: string) => {
  const words = tokenizeWithSpans(text);
  for (const w of words) expect(text.slice(w.span.start, w.span.end)).toBe(w.text);
  return words;
};

describe("tokenizeWords normalization invariant", () => {
  // Everything in offsets.ts rests on this: the tokenizer only ever inserts spaces. If someone
  // teaches it to rewrite a character (lowercase, straighten a curly quote, drop a token), the
  // offset walk silently skews — so assert it here where the failure is legible.
  const corpus = [
    "He won't go.",
    "He won’t go.",
    'She said "the cat\'s hat" twice.',
    "“Really?” he asked.",
    "It's a well-known e-mail address, isn't it?",
    "A.B.C. 3.14 co-op   spaced\tout",
    "  leading and trailing   ",
    "They'll've done it -- maybe.",
    "hyphen–dash — em",
  ];
  for (const text of corpus) {
    it(`only inserts whitespace: ${JSON.stringify(text)}`, () => {
      expect(tokenizeWords(text).join("")).toBe(text.replace(/\s+/g, ""));
    });
  }
});

describe("tokenizeWithSpans (token -> source offsets)", () => {
  it("maps a plain sentence, punctuation peeled back to its own character", () => {
    const text = "The dog barked.";
    const words = roundTrips(text);
    expect(words.map((w) => w.text)).toEqual(["The", "dog", "barked", "."]);
    expect(words.map((w) => w.span)).toEqual([
      { start: 0, end: 3 },
      { start: 4, end: 7 },
      { start: 8, end: 14 },
      { start: 14, end: 15 },
    ]);
  });

  it("splits a contraction inside the source word at the apostrophe", () => {
    const text = "He won't go.";
    const words = roundTrips(text);
    expect(words.map((w) => w.text)).toEqual(["He", "wo", "n't", "go", "."]);
    expect(words[1]!.span).toEqual({ start: 3, end: 5 }); // "wo"
    expect(words[2]!.span).toEqual({ start: 5, end: 8 }); // "n't", still inside "won't"
    expect(text.slice(words[1]!.span.start, words[2]!.span.end)).toBe("won't"); // the two rejoin
  });

  it("splits a clitic the same way", () => {
    const text = "It's a hat.";
    const words = roundTrips(text);
    expect(words.map((w) => w.text)).toEqual(["It", "'s", "a", "hat", "."]);
    expect(words[0]!.span).toEqual({ start: 0, end: 2 });
    expect(words[1]!.span).toEqual({ start: 2, end: 4 });
  });

  it("keeps a curly apostrophe as one word (the tokenizer only splits ASCII ones)", () => {
    const text = "He won’t go";
    const words = roundTrips(text);
    expect(words.map((w) => w.text)).toEqual(["He", "won’t", "go"]);
    expect(text.slice(words[1]!.span.start, words[1]!.span.end)).toBe("won’t");
  });

  it("survives curly quotes glued to a word (not in the peeled punctuation class)", () => {
    const text = "“Really?” he asked.";
    const words = roundTrips(text);
    expect(words.map((w) => w.text)).toEqual(["“Really", "?", "”", "he", "asked", "."]);
    expect(words[0]!.span).toEqual({ start: 0, end: 7 });
  });

  it("maps ASCII quotes, which ARE peeled, to their own offsets", () => {
    const text = 'She said "the cat\'s hat" twice.';
    const words = roundTrips(text);
    expect(words.map((w) => w.text)).toEqual(["She", "said", '"', "the", "cat", "'s", "hat", '"', "twice", "."]);
    const quotes = words.filter((w) => w.text === '"').map((w) => w.span.start);
    expect(quotes).toEqual([9, 23]); // two identical tokens, two distinct offsets
  });

  it("gives repeated identical words distinct, advancing offsets", () => {
    const text = "The dog saw the dog and the dog ran.";
    const words = roundTrips(text);
    const dogs = words.filter((w) => w.text === "dog").map((w) => w.span);
    expect(dogs).toEqual([{ start: 4, end: 7 }, { start: 16, end: 19 }, { start: 28, end: 31 }]);
    for (let i = 1; i < words.length; i++) expect(words[i]!.span.start).toBeGreaterThanOrEqual(words[i - 1]!.span.end);
  });

  it("gives three repeated contractions distinct offsets", () => {
    const text = "Don't don't don't.";
    const words = roundTrips(text);
    expect(words.map((w) => w.text)).toEqual(["Do", "n't", "do", "n't", "do", "n't", "."]);
    expect(words.filter((w) => w.text === "n't").map((w) => w.span.start)).toEqual([2, 8, 14]);
  });

  it("absorbs the leading trim so offsets stay absolute", () => {
    const text = "   \n  The owl hooted.  ";
    const words = roundTrips(text);
    expect(words[0]!.span.start).toBe(6);
    expect(text.slice(words[0]!.span.start, words[0]!.span.end)).toBe("The");
  });

  it("handles irregular internal whitespace, hyphens and dashes", () => {
    const text = "A well-known co-op\t\tsigned  --  twice";
    const words = roundTrips(text);
    expect(words.map((w) => w.text)).toEqual(["A", "well-known", "co-op", "signed", "--", "twice"]);
  });

  it("handles astral characters without splitting a surrogate pair", () => {
    const text = "emoji \u{1F600} here";
    const words = roundTrips(text);
    expect(words[1]!.text).toBe("\u{1F600}");
  });

  it("returns nothing for text with no tokens", () => {
    expect(tokenizeWithSpans("   \n ")).toEqual([]);
  });
});

describe("tokenSpans", () => {
  it("offsets by `base` so a unit slice yields document-absolute spans", () => {
    const doc = "First one. The dog barked.";
    const unit = "The dog barked";
    const words = tokenSpans(unit, tokenizeWords(unit), doc.indexOf(unit));
    for (const w of words) expect(doc.slice(w.span.start, w.span.end)).toBe(w.text);
    expect(words[2]!.span).toEqual({ start: 19, end: 25 });
  });

  it("degrades monotonically when handed tokens that were rewritten, not just re-split", () => {
    // Not something tokenizeWords produces — a guard so a future normalizing tokenizer can't
    // scramble the walk for the tokens that follow.
    const text = "The DOG barked";
    const words = tokenSpans(text, ["The", "dog", "barked"]);
    expect(words[2]!.span).toEqual({ start: 8, end: 14 }); // "barked" still lands correctly
    expect(text.slice(words[2]!.span.start, words[2]!.span.end)).toBe("barked");
  });
});

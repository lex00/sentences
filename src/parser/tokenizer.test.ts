import { describe, it, expect } from "vitest";
import { T5Tokenizer, type UnigramModel } from "./tokenizer.js";
import model from "./__fixtures__/t5-unigram.json";
import tokFixtures from "./__fixtures__/tok-fixtures.json";
import feedFixtures from "./__fixtures__/feed-fixtures.json";

const tok = new T5Tokenizer(model as UnigramModel);

describe("T5 Unigram tokenizer", () => {
  it("tokenizes words to the same subword ids as the Python reference", () => {
    for (const [word, ids] of Object.entries(tokFixtures as Record<string, number[]>)) {
      expect(tok.tokenizeWord(word)).toEqual(ids);
    }
  });
});

describe("feed construction matches benepar", () => {
  for (const fx of feedFixtures as unknown as Array<{ words: string[] } & Record<string, number[] | boolean[]>>) {
    it(`builds feeds for "${fx.words.join(" ")}"`, () => {
      const f = tok.buildFeeds(fx.words);
      expect(f.input_ids).toEqual(fx.input_ids);
      expect(f.words_from_tokens).toEqual(fx.words_from_tokens);
      expect(f.decoder_input_ids).toEqual(fx.decoder_input_ids);
      expect(f.attention_mask).toEqual(fx.attention_mask);
      expect(f.decoder_attention_mask).toEqual(fx.decoder_attention_mask);
      expect(f.valid_token_mask).toEqual(fx.valid_token_mask);
    });
  }
});

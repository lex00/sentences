// Neural constituency parser in the browser: tokenize -> ONNX Runtime Web (benepar int8) ->
// span/tag scores -> CKY -> PTB Tree -> lower(). Ties together the pieces validated headlessly
// against the Python reference (tokenizer.ts, cky.ts). The ORT-Web session itself is the one
// part that only runs in a real browser — verify there.

import * as ort from "onnxruntime-web";
import { T5Tokenizer, type UnigramModel } from "./tokenizer.js";
import { ckyDecode, ckyKBestScored, type ParserVocab } from "./cky.js";
import type { Tree } from "../ptb.js";

// Treebank-ish word tokenization (peel punctuation, split contractions: won't -> wo n't).
export function tokenizeWords(text: string): string[] {
  return text
    .trim()
    .replace(/([.,!?;:"()\[\]])/g, " $1 ")
    .replace(/(\w+)(n't)\b/g, "$1 $2")
    .replace(/(\w+)('(?:s|re|ve|ll|d|m))\b/g, "$1 $2")
    .split(/\s+/)
    .filter(Boolean);
}

export class ModelParser {
  private constructor(
    private session: ort.InferenceSession,
    private tok: T5Tokenizer,
    private vocab: ParserVocab,
  ) {}

  static async load(base = "/models"): Promise<ModelParser> {
    // Single-threaded wasm: no SharedArrayBuffer / cross-origin isolation (COOP/COEP) required,
    // so it works on a plain static host and the Vite dev server.
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.wasmPaths = "https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/";
    const [unigram, vocab] = await Promise.all([
      fetch(`${base}/t5-unigram.json`).then((r) => r.json() as Promise<UnigramModel>),
      fetch(`${base}/vocab.json`).then((r) => r.json() as Promise<ParserVocab>),
    ]);
    const session = await ort.InferenceSession.create(`${base}/benepar.int8.onnx`, { executionProviders: ["wasm"] });
    return new ModelParser(session, new T5Tokenizer(unigram), vocab);
  }

  async parse(text: string): Promise<Tree> {
    const { spanScores, tagIds, words } = await this.score(text);
    return ckyDecode(spanScores, tagIds, words, this.vocab); // (TOP (S ...))
  }

  // k-best parses from one forward pass, pruned to genuine near-ties: only parses within `margin`
  // logits of the best survive, so an unambiguous sentence yields one parse and a real attachment
  // ambiguity yields a few. (Observed degenerate label-drop parses sit ~1.9+ below the best.)
  async parseNBest(text: string, k: number, margin = 1.2): Promise<Tree[]> {
    const { spanScores, tagIds, words } = await this.score(text);
    const scored = ckyKBestScored(spanScores, tagIds, words, this.vocab, k);
    const best = scored[0]?.score ?? 0;
    return scored.filter((r) => best - r.score <= margin).map((r) => r.tree);
  }

  // The forward pass: tokenize -> ORT-Web -> span-label logits + per-word POS tag ids.
  private async score(text: string): Promise<{ spanScores: number[][][]; tagIds: number[]; words: string[] }> {
    const words = tokenizeWords(text);
    if (words.length === 0) throw new Error("empty input");
    const f = this.tok.buildFeeds(words);
    const i64 = (a: number[]) => new ort.Tensor("int64", BigInt64Array.from(a.map(BigInt)), [1, a.length]);
    const out = await this.session.run({
      input_ids: i64(f.input_ids),
      attention_mask: i64(f.attention_mask),
      words_from_tokens: i64(f.words_from_tokens),
      decoder_input_ids: i64(f.decoder_input_ids),
      decoder_attention_mask: i64(f.decoder_attention_mask),
      valid_token_mask: new ort.Tensor("bool", Uint8Array.from(f.valid_token_mask.map((b) => (b ? 1 : 0))), [1, f.valid_token_mask.length]),
    });

    const n = words.length;
    const span = out.span_scores!;
    const L = span.dims[3] as number;
    const sd = span.data as Float32Array;
    const spanScores: number[][][] = [];
    for (let i = 0; i < n; i++) {
      const row: number[][] = [];
      for (let j = 0; j < n; j++) {
        const v = new Array<number>(L);
        const base = (i * n + j) * L;
        for (let l = 0; l < L; l++) v[l] = sd[base + l]!;
        row.push(v);
      }
      spanScores.push(row);
    }

    const tag = out.tag_scores!;
    const G = tag.dims[2] as number;
    const td = tag.data as Float32Array;
    const tagIds: number[] = [];
    for (let w = 1; w <= n; w++) {
      let bi = 0;
      let bv = -Infinity;
      for (let g = 0; g < G; g++) {
        const val = td[w * G + g]!;
        if (val > bv) { bv = val; bi = g; }
      }
      tagIds.push(bi);
    }

    return { spanScores, tagIds, words };
  }
}

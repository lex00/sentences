// Neural constituency parser in the browser: tokenize -> ONNX Runtime Web (benepar int8) ->
// span/tag scores -> CKY -> PTB Tree -> lower(). Ties together the pieces validated headlessly
// against the Python reference (tokenizer.ts, cky.ts). The ORT-Web session itself is the one
// part that only runs in a real browser — verify there.
import * as ort from "onnxruntime-web";
import { T5Tokenizer } from "./tokenizer.js";
import { ckyDecode } from "./cky.js";
// Treebank-ish word tokenization (peel punctuation, split contractions: won't -> wo n't).
export function tokenizeWords(text) {
    return text
        .trim()
        .replace(/([.,!?;:"()\[\]])/g, " $1 ")
        .replace(/(\w+)(n't)\b/g, "$1 $2")
        .replace(/(\w+)('(?:s|re|ve|ll|d|m))\b/g, "$1 $2")
        .split(/\s+/)
        .filter(Boolean);
}
export class ModelParser {
    session;
    tok;
    vocab;
    constructor(session, tok, vocab) {
        this.session = session;
        this.tok = tok;
        this.vocab = vocab;
    }
    static async load(base = "/models") {
        // Single-threaded wasm: no SharedArrayBuffer / cross-origin isolation (COOP/COEP) required,
        // so it works on a plain static host and the Vite dev server.
        ort.env.wasm.numThreads = 1;
        ort.env.wasm.wasmPaths = "https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/";
        const [unigram, vocab] = await Promise.all([
            fetch(`${base}/t5-unigram.json`).then((r) => r.json()),
            fetch(`${base}/vocab.json`).then((r) => r.json()),
        ]);
        const session = await ort.InferenceSession.create(`${base}/benepar.int8.onnx`, { executionProviders: ["wasm"] });
        return new ModelParser(session, new T5Tokenizer(unigram), vocab);
    }
    async parse(text) {
        const words = tokenizeWords(text);
        if (words.length === 0)
            throw new Error("empty input");
        const f = this.tok.buildFeeds(words);
        const i64 = (a) => new ort.Tensor("int64", BigInt64Array.from(a.map(BigInt)), [1, a.length]);
        const out = await this.session.run({
            input_ids: i64(f.input_ids),
            attention_mask: i64(f.attention_mask),
            words_from_tokens: i64(f.words_from_tokens),
            decoder_input_ids: i64(f.decoder_input_ids),
            decoder_attention_mask: i64(f.decoder_attention_mask),
            valid_token_mask: new ort.Tensor("bool", Uint8Array.from(f.valid_token_mask.map((b) => (b ? 1 : 0))), [1, f.valid_token_mask.length]),
        });
        const n = words.length;
        const span = out.span_scores;
        const L = span.dims[3];
        const sd = span.data;
        const spanScores = [];
        for (let i = 0; i < n; i++) {
            const row = [];
            for (let j = 0; j < n; j++) {
                const v = new Array(L);
                const base = (i * n + j) * L;
                for (let l = 0; l < L; l++)
                    v[l] = sd[base + l];
                row.push(v);
            }
            spanScores.push(row);
        }
        const tag = out.tag_scores;
        const G = tag.dims[2];
        const td = tag.data;
        const tagIds = [];
        for (let w = 1; w <= n; w++) {
            let bi = 0;
            let bv = -Infinity;
            for (let g = 0; g < G; g++) {
                const val = td[w * G + g];
                if (val > bv) {
                    bv = val;
                    bi = g;
                }
            }
            tagIds.push(bi);
        }
        return ckyDecode(spanScores, tagIds, words, this.vocab); // (TOP (S ...))
    }
}

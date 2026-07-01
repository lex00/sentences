// T5 SentencePiece (Unigram) tokenizer + benepar feed construction, in TS.
//
// We tokenize WORD-BY-WORD (each word gets the "▁" space prefix the Metaspace pre-tokenizer
// adds), which yields the per-word subword boundaries for free — no offset-mapping needed.
// Then we assemble exactly the 6 tensors benepar's retokenize produces (derived empirically
// from the reference; see parser-export/). Validated against feed-fixtures.json.
const SPACE = "▁"; // ▁ metaspace marker
export class T5Tokenizer {
    model;
    piece = new Map();
    maxLen = 1;
    constructor(model) {
        this.model = model;
        model.vocab.forEach(([p, score], id) => {
            this.piece.set(p, { id, score });
            if (p.length > this.maxLen)
                this.maxLen = p.length;
        });
    }
    // Unigram Viterbi over one word, prefixed with the metaspace marker.
    tokenizeWord(word) {
        const s = SPACE + word.normalize("NFKC");
        const n = s.length;
        const best = new Array(n + 1).fill(-Infinity);
        const back = new Array(n + 1);
        best[0] = 0;
        for (let i = 1; i <= n; i++) {
            for (let j = Math.max(0, i - this.maxLen); j < i; j++) {
                if (best[j] === -Infinity)
                    continue;
                const hit = this.piece.get(s.slice(j, i));
                if (hit && best[j] + hit.score > best[i]) {
                    best[i] = best[j] + hit.score;
                    back[i] = { start: j, id: hit.id };
                }
            }
            if (best[i] === -Infinity) {
                // single char fallback: known char piece, else <unk>
                const c = this.piece.get(s.slice(i - 1, i));
                best[i] = (best[i - 1] === -Infinity ? 0 : best[i - 1]) - 10;
                back[i] = { start: i - 1, id: c ? c.id : this.model.unk_id };
            }
        }
        const ids = [];
        for (let i = n; i > 0;) {
            const b = back[i];
            ids.push(b.id);
            i = b.start;
        }
        return ids.reverse();
    }
    // Build the 6 model feeds for a list of words (matches benepar's retokenize for T5).
    buildFeeds(words) {
        const subwords = [];
        const wft = [0]; // start token -> decoder index 0
        for (const w of words) {
            const ids = this.tokenizeWord(w);
            const lastEnc = subwords.length + ids.length - 1; // last subword's encoder index
            subwords.push(...ids);
            wft.push(lastEnc + 1); // +1 for the T5 decoder shift
        }
        const input_ids = [...subwords, this.model.eos_id];
        const decoder_input_ids = [this.model.pad_id, ...input_ids];
        wft.push(input_ids.length); // stop token -> last decoder index (= len(decoder)-1)
        return {
            input_ids,
            attention_mask: input_ids.map(() => 1),
            words_from_tokens: wft,
            decoder_input_ids,
            decoder_attention_mask: decoder_input_ids.map(() => 1),
            valid_token_mask: new Array(words.length + 2).fill(true),
        };
    }
}

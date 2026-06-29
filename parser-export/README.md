# benepar → ONNX export toolchain

Exports the Berkeley Neural Parser (`benepar_en3`) to ONNX so a constituency parser can run
client-side (ONNX Runtime Web) and feed the Reed-Kellogg pipeline's `lower()`. See
`docs/PARSER-MODEL-EVAL.md` for why this path was chosen.

## What it does

`benepar_en3` = T5Model (encoder+decoder, 60M params) + a partitioned-transformer encoder
(6.3M) + a 123-label span-score head. Its forward produces a **span-score chart**
`[batch, words+1, words+1, 124]`; a **CKY chart-decoder** (pure Python in benepar) then finds
the max-scoring tree. We export the **neural part through span_scores** and (will) reimplement
CKY in JS — the clean split the architecture already has.

## Setup (Python 3.13 via uv; benepar needs transformers 4.x)

```sh
uv venv --python 3.13 .venv
VIRTUAL_ENV=.venv uv pip install benepar onnx onnxruntime "transformers==4.36.2" "tokenizers<0.19"
```

Note: transformers 5.x removes `build_inputs_with_special_tokens` that benepar relies on — pin 4.x.

## Scripts

- `probe.py` — inspect model architecture + batch tensor shapes.
- `export.py` — `torch.onnx.export` (legacy tracer, `dynamo=False`) of a wrapper that returns
  `span_scores`. Monkeypatches the lone **integer Relu** (`F.relu(words_from_tokens)`, which
  ORT-Web can't run) into a no-op; the caller must **pre-clamp `words_from_tokens` to ≥0**
  (invalid positions → 0). Outputs `benepar.onnx` (258 MB fp32).
- `verify.py` — `quantize_dynamic` → `benepar.int8.onnx` (72 MB), then compares ONNX vs torch
  span-scores.

## Inputs / output (the ONNX contract for the JS side)

Inputs (all int64 except the last):
`input_ids`, `attention_mask`, `words_from_tokens` (subword index per word slot, **clamp ≥0**),
`decoder_input_ids`, `decoder_attention_mask`, `valid_token_mask` (bool).
Output: `span_scores` `[b, w, w, 124]`.

## Validation (this machine, 2026-06-29)

| Model | Size | max\|onnx−torch\| | span-label argmax agreement |
|---|---|---|---|
| fp32 | 258 MB | 0.0000 | 100% (bit-exact) |
| int8 | 72 MB | 0.108 | 98.3% |

int8 is the shippable artifact (one-time cached browser download). If trees ever diverge from
the reference on hard sentences, fp16 (~134 MB) is the near-exact fallback.

**End-to-end (e2e.py):** int8 ONNX → CKY produces trees that **exactly match** benepar's
reference on 5/5 test sentences, including "It won't be the carbon dioxide that kills us" (the
relative clause the rule-based parser can't recover). So the 98.3% span agreement still yields
correct trees — disagreements fall on low-confidence spans that don't change the argmax.

The TS side (`src/parser/`) is validated against the Python reference: the Unigram tokenizer
reproduces subword ids exactly, feed construction matches all 6 tensors, and the CKY decoder
reproduces every reference tree. Only the ORT-Web browser session + app wiring remain.

## Remaining (TS side, see tasks)

1. ORT-Web session + feed construction (tokenization + `words_from_tokens` + decoder ids).
2. SentencePiece (T5) tokenizer in JS with subword→word alignment (mirror benepar's retokenize).
3. JS port of benepar's CKY chart-decoder → PTB `Tree` → existing `lower()`.
4. Decide hosting for the 72 MB weights (not committed; build artifact).

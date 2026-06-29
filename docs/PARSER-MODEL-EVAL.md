# In-browser parser model — evaluation (2026-06-29)

Question: can a real parser run **client-side** (static site, WASM/WebGPU, no server) and
produce structure good enough for the Reed-Kellogg pipeline? R-K wants **constituency** (PTB
brackets), which `lower()` already consumes; dependency (UD) is the fallback but needs a new
lowering.

## The four paths, with numbers

| Path | Output | First-load | Accuracy | Off-the-shelf? | Build effort | Feeds R-K pipeline? |
|---|---|---|---|---|---|---|
| **Transformers.js — constituency** | — | — | — | **No — 0 models, no pipeline** | — | — |
| Transformers.js — dependency (ud-goeswith hack) | UD deps | 504 MB fp32 (self-quant ~125 MB int8) | RoBERTa-base UD | barely — 1 model, custom JS decode | medium | needs dep→R-K lowering |
| **benepar → ONNX (T5-small encoder + JS CKY)** | **PTB constituency** | **~36 MB int8** | **95.4 F1** | No — you build it | **~1–2 wks ML-ops** | **Yes — directly into `lower()`** |
| UDPipe → WASM (compile yourself) | UD deps | ~15.6 MB | ~77 LAS | No — no WASM build exists | medium–high | needs dep→R-K lowering |
| spaCy via Pyodide | UD deps | tens of MB + Pyodide runtime | ~90 LAS | demo-grade only | low code / heavy UX | needs dep→R-K lowering |
| Small in-browser LLM (WebLLM/WebGPU) | "parses" | 207 MB–2 GB | **0–33 F1, ~50% malformed** | Yes, runs today | low | **No — malformed trees** |

## Key findings

- **No off-the-shelf in-browser parser exists** — constituency *or* dependency. Every viable
  path is "build it yourself." (Transformers.js has no constituency models at all; dependency
  only via a 504 MB token-classification hack.)
- **The LLM path is a precision trap.** Sub-2B models score ~0–33 F1 on constituency and emit
  *malformed* trees (invented/dropped words, unbalanced brackets) — even GPT-4 is ~50% invalid
  unconstrained. A malformed tree can't be drawn. Robust to anything, but produces garbage
  structure. Only usable as a hard-validated fallback, not the parser. (A *fine-tuned* small
  seq2seq parser recovers ~95 F1 — but that's training effort, not zero-shot.)
- **Dependency routes (UDPipe-WASM, spaCy-Pyodide) are DIY too**, lower accuracy or heavy UX,
  and still need a new dependency→R-K lowering since R-K is constituency-shaped.

## Recommendation: benepar `en3` T5-small encoder → ONNX

The only path that gives **high-accuracy constituency, at a reasonable size, that drops into
our existing pipeline**:

- benepar's best model is just a **T5-small encoder** (~36 MB int8) + a span-score head.
- The expensive **CKY chart-decode is already separated** from the neural net (pure
  Python/NumPy in benepar) → reimplement ~150 lines in JS.
- Output is **Penn-Treebank brackets → `lower()` already consumes them.** No pipeline changes
  downstream — it slots in exactly where the rule-based chunker is (parser is a swappable PTB
  producer, by design).
- **95.4 F1** before quantization — robust to the real prose that breaks the rule-based parser
  (relative clauses, etc.).

**Cost / risk (be clear-eyed):** ~1–2 weeks of ML-ops — a custom `torch.onnx` export wrapper
that emits span scores, a JS CKY decoder + tree builder, JS tokenization with subword→word span
alignment, and validation against the Python reference. Environment risk: torch/benepar on
Python 3.14 may not install cleanly (same bleeding-edge issue as before).

## Suggested next step: a de-risking spike

Before committing to the full build, prove the riskiest 30%:
1. Export the T5-small encoder + span-score head to ONNX; confirm it loads in ONNX Runtime Web.
2. Confirm size (~36 MB int8) and a single-sentence inference works in a browser.
3. Then decide on the JS CKY + tokenizer-alignment work.

If the export/ORT-Web spike fails, fall back: keep rule-based for English now, or accept a
build-time/server parse for a hosted version.

# Parser → IR (Phase 6)

The renderer never depends on Python at runtime. A constituency parser produces Penn-Treebank
bracket strings; `src/lower.ts` lowers those into the `Clause` IR; the rest of the pipeline
(layout → Scene → Animator → executor) is unchanged.

```
sentence ──(tools/parse.py: benepar)──► PTB bracket string ──(src/ptb.ts)──► Tree
                                                                                │
                                                          (src/lower.ts) ◄──────┘
                                                                │
                                                          Clause IR ──► layout() ──► …
```

## Why this split

`RESEARCH.md`'s key finding: no maintained tool converts an NLP parse into Reed-Kellogg
notation. **That converter is `src/lower.ts`** — the bridge, and the durable artifact. The
parser is a swappable producer of bracket strings (benepar today; any constituency parser that
emits PTB works). Constituency, not dependency: R-K is constituency-shaped.

## Status

- `src/ptb.ts` + `src/lower.ts`: built and tested in pure TS against real-shape PTB parses.
  End-to-end test confirms parser output lays out with the **same ids** as the hand-built
  fixtures — i.e. it feeds the existing pipeline identically.
- `tools/parse.py`: the benepar adapter (stdin sentences → stdout bracket strings). **Not run
  in CI** — it pulls spaCy + benepar + a ~500MB model + PyTorch. Setup is documented in the
  script header. Live wiring (spawn the script / a service, stream parses into `lower()`) is
  the remaining integration step.

## Coverage & limits

Lowered today: S → NP subject + VP predicate; pre-modifiers (DT/JJ/PRP$/CD/RB); head nouns
(last noun wins, earlier nouns become adjuncts); PP modifiers (recursive); coordination
(NP/VP + CC → `Compound`); copula + NP/ADJP → predicate noun/adjective; transitive NP →
direct object; SBAR → subordinate-clause modifier; auxiliary verb chains ("has been running").

Unsupported shapes throw a clear error; `lowerNBest()` drops failing parses rather than
mis-diagramming. Known gaps: indirect objects, appositives, participial phrases, gapping,
and most non-S roots. Ambiguous parses (PP-attachment, etc.) yield multiple IRs via N-best —
matching the inherent ambiguity noted in `RESEARCH.md`.

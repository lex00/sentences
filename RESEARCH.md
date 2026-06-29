# Sentence Diagramming: Tool Landscape

> Research compiled 2026-06-27 via a deep-research sweep (6 search angles, 18 sources
> fetched, 78 claims extracted, 3-vote adversarial verification → 23 confirmed, 2 killed).
> Primary focus: Reed-Kellogg (classic pedagogical) diagramming tools.
> Audience: a technical builder evaluating whether to build a Reed-Kellogg rendering/generation tool.

## Headline finding

**There is no reliable, maintained tool that automatically converts an NLP parse into
Reed-Kellogg (R-K) notation.** Two candidates claimed to; both failed verification:

- **1AiWay "Reed-Kellogg Diagrammer"** genuinely does automatic NLP-parse → R-K conversion
  (POS tagging → syntax rules → constituency → R-K rendering). But it is built on
  **Microsoft Silverlight** — a dead, end-of-life browser plugin. It explicitly fails in
  Chrome. The only working fallback is a proprietary Windows Store app. Architecturally it is
  the proof-of-concept worth studying; practically it is dead.
- **ConceptViz "Sentence Diagram Generator"** advertises automatic R-K from free text — but
  this claim was **killed 0–3 in verification**. Verifiers could not confirm it produces
  correct R-K output. Treat as unproven.

**Implication:** the gap is real and it is greenfield. Every robust parser stops at
dependency/constituency trees; every R-K tool that renders well is manual. Nobody owns the
bridge between them.

## Primary: Reed-Kellogg–specific tools

| Tool | Auto/Manual | Open/Proprietary | License | Platform | Status | Notes |
|---|---|---|---|---|---|---|
| **1AiWay R-K Diagrammer** (nlp4net) | **Automatic** | Proprietary | — | Silverlight web + Windows app | **Dead** (Silverlight EOL) | Only true NLP→R-K pipeline found. Emits multiple diagrams for ambiguous sentences. Complete sentences only, first sentence only; fails on long/legal/poetic text. XAP package `ReedKelloggDiagrammer.xap`, .NET/Silverlight stack. |
| **SentenceVizu** | Manual (drag-and-drop) | Proprietary | none | Web (Chrome/Firefox/Safari/Edge) | Active | Free. Uses NLP for *color-coding* only — analysis is **separate** from the R-K editor; does not auto-build the diagram. Supports baseline/dividers/modifier lines. |
| **covertcj/Reed-Kellogg** | Unclear (no docs) | Open source | **none specified** | iPad (Objective-C) | **Abandoned** (last push 2012-01-26) | 0 stars/forks, no README. "No license" = legally not reusable despite being public. |
| **ConceptViz Sentence Diagram Generator** | Claims automatic | Proprietary | none | Web | ? | **Auto-R-K claim refuted in verification.** Image-download output. Do not rely on it. |
| **SenDraw** | Manual | Proprietary | — | Desktop | Archived | Specialized R-K program, historical. |
| **SenGram** | Manual (puzzle-based) | Proprietary | — | iPhone/iPad | — | Diagrams as puzzles, not generation from arbitrary text. |

**The R-K notation spec itself is concrete and renderable** — the one genuinely encouraging
finding: horizontal baseline; subject/predicate split by a vertical bar; modifiers (adjectives,
adverbs, articles) on slanted lines below the words they modify. A tractable geometry to target.

## Secondary: building blocks for the stack

### Tree renderers (all take manual bracket notation; none do R-K, but proven layout engines)

| Tool | Language | License | Status | Output | Worth it for |
|---|---|---|---|---|---|
| **RSyntaxTree** | Ruby | MIT | Active (hosted at yohasebe.com/rsyntaxtree) | PNG, SVG, PDF, JPG, GIF, **LSIF/JSON** | Best reuse candidate — CLI/gem/Docker/web, multi-format, JSON output. |
| **jsSyntaxTree** | JS | GPL-2.0 | last v1.2 (2022-12-15) | SVG/canvas | Browser-side; port of phpSyntaxTree (ironcreek.net/syntaxtree). GPL is a licensing constraint. |
| **Forest** | LaTeX/TikZ | LPPL-1.3c | Dormant (v2.1.5, 2017-07-14) | TikZ | Excellent compact-packing layout algorithm if targeting LaTeX. |
| **tikz-qtree** | LaTeX | MIT | Stale (v1.2, 2012-04-20) | TikZ | Auto node layout, collision-free; simpler than Forest. |

### Parsers (produce the structure to transform into R-K)

- **Stanza** (Stanford) — Apache-2.0, **actively maintained** (v1.13.0, 2026-06-18), 60+
  languages, Universal Dependencies output. Strong base for the parse stage. *Note: the claim
  that it "lacks constituency parsing" was **refuted** — Stanza does have a constituency parser,
  which matters because R-K maps more naturally from constituency than dependency structure.*
- **benepar** (Berkeley Neural Parser, `nikitakit/self-attentive-parser`) — open source,
  ACL 2018 (arXiv:1805.01052), self-attentive **constituency** parser, integrates with spaCy.
  Likely the best parse source for R-K since R-K is constituency-shaped.
- **spaCy / displaCy** — open source; SVG output, customizable (compact/color/bg/font/offset_x);
  `displacy.render()`/`displacy.serve()`, Jupyter auto-render, separate client-side
  `displacy.js`. But only does dep/ent/span viz — **not** constituency, **not** R-K. Reusable
  as a styleable SVG layer; wrong diagram model.
- **Arborator** (`Arborator/arborator-server`) — AGPL-3.0, Python/JS, collaborative dependency
  annotation in CoNLL format. Dependency-only, not relevant to R-K shape.
- **Stanford Parser** / **NLTK** — older recommendations for getting parse structures from text.
- GitHub `dependency-parsing` topic — rich ecosystem (yzhangcs/parser, Trankit, NLP-Cube,
  DDParser, VnCoreNLP). None convert to R-K notation.

## What this means for a builder

1. **The bridge is the product.** Parsers and renderers both exist and are mature; the missing
   piece is parse → R-K geometry. That is where the value would be.
2. **Start from constituency, not dependency.** R-K's nested subject/predicate/modifier
   structure maps far more naturally from constituency trees (benepar, Stanza constituency) than
   from UD dependency arcs.
3. **Ambiguity is unavoidable.** The one tool that did this (1AiWay) emitted multiple diagrams
   per ambiguous sentence (e.g. PP-attachment). Plan for N-best output, not a single answer.
4. **Rendering: SVG is the consensus target.** Borrow RSyntaxTree's multi-format approach or
   displaCy's styleable-SVG model; the R-K slanted-modifier geometry is custom but well-defined.
5. **Licensing watch:** jsSyntaxTree (GPL-2.0) and Arborator (AGPL-3.0) are copyleft;
   RSyntaxTree (MIT), tikz-qtree (MIT), Stanza (Apache-2.0), benepar (open) are permissive and
   safer to build on.

## Terminology note

There is a community split: linguists/grammarians call traditional sentence diagrams
"Reed-Kellogg" diagrams; NLP/CS practitioners call the equivalent structures "parse trees" or
"concrete syntax trees" (typically via PCFGs). The two notations are **not** the same diagram
format — conflating them is a common source of confusion and partly explains why the
parse→R-K converter gap persists.

## Sources

- https://github.com/covertcj/Reed-Kellogg
- http://1aiway.com/nlp4net/docs/help_reed_kellogg.aspx
- http://1aiway.com/nlp4net/services/enparser/
- https://www.sentencevizu.com/ , https://www.sentencevizu.com/diagram/
- https://conceptviz.app/tools/sentence-diagram-generator  (auto-R-K claim refuted)
- https://en.wikipedia.org/wiki/Reed%E2%80%93Kellogg_sentence_diagram
- http://compsocsci.blogspot.com/2011/11/resources-on-nlp-sentence-diagramming.html
- https://github.com/yohasebe/rsyntaxtree
- https://github.com/int2str/jssyntaxtree
- https://github.com/sasozivanovic/forest
- https://github.com/davidweichiang/tikz-qtree
- https://github.com/Arborator/arborator-server
- https://spacy.io/usage/visualizers
- https://spacy.io/universe/project/self-attentive-parser
- https://github.com/stanfordnlp/stanza
- https://github.com/topics/dependency-parsing

# Reed-Kellogg Sentence Diagram Engine

Automatic Reed-Kellogg sentence diagramming in the browser. Type a sentence; a neural
constituency parser (benepar, run client-side via ONNX Runtime Web) produces a parse, which is
lowered to a grammatical IR and laid out as a Reed-Kellogg diagram. No server, no install.

## Why this exists

Reed-Kellogg diagrams are the traditional pedagogical sentence diagram: a horizontal baseline, a
vertical bar splitting subject and predicate, modifiers on slanted lines below the words they
modify. Existing tools split into two camps — manual editors that render nothing automatically,
and NLP parsers that stop at dependency or constituency trees. The one tool that ever generated
Reed-Kellogg diagrams from arbitrary text automatically (1AiWay) runs on Silverlight and no longer
works in a modern browser. This project fills that gap: automatic parse → Reed-Kellogg, entirely
client-side. `RESEARCH.md` documents the landscape survey behind that claim.

## Status

- Automatic constituency-parse → Reed-Kellogg, in-browser, with a rule-based fallback parser.
- 90/90 clean on a battery of sentences drawn from real diagramming lessons — zero dropped words,
  zero label/line collisions — across imperatives, questions, relative / noun / adverb clauses,
  gerund / infinitive / participle verbals, appositives, correlatives, indirect and objective
  complements, causative small clauses, and absolute phrases.
- Ambiguous sentences surface alternative parses instead of guessing.
- SVG export.
- 216 tests; a geometric collision detector gates layout correctness.

Not yet: in-place correction of a wrong diagram, export formats beyond SVG, and validation on
non-pedagogical prose. See `ROADMAP.md`.

## Run

```
npm install
npm run dev
```

The neural parser weights (~72 MB — benepar exported to int8 ONNX) are a build artifact and are
not committed. Regenerate them with the scripts in `parser-export/` (Python + benepar). Without
them, the app falls back to a pure-TypeScript rule-based parser.

## Build and test

```
npm run build      # static site into dist/
npm test           # unit + collision-regression suites
```

## Architecture

text → neural constituency parse (`src/parser/`) → Clause IR (`src/lower.ts`) → footprint layout
(`src/layout.ts`) → Scene → Canvas / WebGPU or SVG renderer. The parse → IR lowering is the piece
no existing tool provides. `DESIGN.md` covers the architecture; `RESEARCH.md` the motivating gap.

## License

MIT. See `LICENSE`.

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

## De-stink

`destink.html` is a second, thin app on the same engine: a deterministic linter for AI-writing
tropes, built off the same constituency parse and Clause IR rather than a second model. It covers
the syntactic, lexical, formatting, and measurable-discourse tiers (repetition, anaphora, dilution)
with located findings, a stink score, and mechanical fixes limited to deleting, moving, or
lightly repairing the author's own words; semantic tropes (stakes inflation as tone, false
vulnerability, dead metaphors beyond lemma counting) are out of scope for a parser and are not
claimed. See `docs/DESTINK.md` for the architecture and `scripts/destink-score.mjs` for the
no-browser CLI.

### CLI

```
node scripts/destink-score.mjs [--markdown] <file>
```

Prints the same versioned JSON report the browser app renders (findings with source spans,
errors, the rule set, and a stink score) to stdout. It only reads the file; nothing is written
back.

- `--markdown` runs the file through `markdown-prose.ts` first, blanking code fences, tables,
  inline code, link targets, HTML blocks, and admonition directives to spaces before linting.
  Offsets still index the original file. Use it on `.md` files — without it, markdown structure
  reads as prose and floods the report with false findings (~64% of findings on a measured
  technical-docs corpus, per that module's header).
- Needs Node >=22.6 (re-execs itself with `--experimental-strip-types`) or >=23 (the flag is on
  by default). The script runs the TypeScript sources directly with no build step; older Node
  exits with an explanation instead of adding a transpiler dependency.
- Not a published `bin` — it only runs from a checkout of this repo, not via `npx`.

## License

MIT. See `LICENSE`.

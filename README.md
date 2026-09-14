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
- `--strictness=N` (1, 2 or 3) sets how hard it looks. 2 is the default and the level every
  threshold was calibrated against; 3 drops density floors to zero, so one instance of a shape
  reports the same as six, and raises each finding a severity step; 1 doubles the floors. Use 3 on
  text you already know a model wrote, when the question is whether the shape is there at all
  rather than whether it is a tic.
- Not a published `bin` — it only runs from a checkout of this repo, not via `npx`. The MCP server
  below is the published one.

### MCP server

```
npx -y --package=sentences destink-mcp
```

The same linter over stdio, for an agent that wants its prose checked while it writes. Register it
with any MCP client; in `.mcp.json` that is:

```json
{
  "mcpServers": {
    "destink": { "command": "npx", "args": ["-y", "--package=sentences", "destink-mcp"] }
  }
}
```

Two read-only tools.

- **`destink_lint`** takes `text` (a draft you are holding) or `path` (a file to read), plus
  `markdown` (on by default for a `.md`/`.markdown`/`.mdx` path), `strictness` (1-3, as above), and
  a `format`. `summary` renders each finding as `line:col` with the offending excerpt and why it
  reads as a tell, printed once per rule rather than repeated down a run. `score` drops the located
  findings and keeps the counts — the cheap call for "did my edit help?". `json` is the full
  versioned report, byte-identical to what the CLI prints for the same input.
- **`destink_rules`** lists the rule set (id, tier and name, in the order findings are attributed
  when two rules tie), so a caller can see what a clean report actually covers before trusting one.

Neither writes a file nor touches the network. The mechanical fixer is not exposed, since which of
an author's words get cut is not a decision to make over a socket. `docs/DESTINK.md` has the
details.

### A lead-in for agents

Paste this into your agent's instructions once the server is registered. It describes the loop the
tool is built for (lint, edit only what was flagged, re-lint to check the edit actually helped)
rather than leaving the model to invent one:

```
You have a prose linter available as the `destink` MCP server. It detects the structural and
lexical patterns that make writing read as AI-generated: negative parallelism ("it's not X, it's
Y"), self-posed rhetorical questions, tricolon and anaphora runs, punchy one-line fragments,
filler transitions, ornate nouns, em-dash density, bold-first bullets, trailing tacked-on
phrases, and cross-sentence repetition.

Use it whenever you have written more than a paragraph of prose a human will read — a README, a
design doc, a PR description, a report, a commit message body.

The loop:

1. Draft normally. Do not try to write around the rules; negative constraints held in mind while
   drafting degrade everything else in the output.
2. Call destink_lint on the draft. Use strictness 3 on text you wrote yourself, since at that
   level a shape is reported on its first appearance instead of waiting for it to become a rate.
3. Edit ONLY the spans it flagged. Do not rewrite whole paragraphs: the parts that were already
   fine get re-rolled at fresh risk of a different tell, and you will not be able to tell whether
   the pass helped.
4. Call destink_lint again with format: "score" and compare. Keep the edit if the score fell and
   no new rule appeared; otherwise put the original back. The number is the judge, not your
   impression of the rewrite.
5. Repeat until the score stops falling, or until the remaining findings are ones you can defend.

Two things the linter does not claim, so do not treat it as claiming them. A clean score means the
text is free of the tells this rule set can name. It is not a statement that the writing is good.
And a finding is not automatically a defect: severity "candidate" means the rule narrowed a
suspect structurally but cannot confirm it without reading for meaning. Read those and decide.

Call destink_rules if you need to know what a rule id means or what a clean report covers.
```

The design behind that loop, and why the model edits while the linter referees rather than the
linter asking a model whether the prose is good, is in `docs/DESTINK.md` under "Oracle-gated".

## License

MIT. See `LICENSE`.

# Changelog

Changes to the published `sentences` package that you would notice using it.
Internal refactors are left out unless they change a result.

## 0.4.1

### Fix: the comma-joined reframe

Negative parallelism folded into a single sentence and joined by a comma, with the same subject and
the same form of "to be" on both sides, the first negated and the second not. This is the form that
opens a great many announcement posts, and every arm of the rule missed it.

Each missed it for a different reason, which is why it survived. One arm looks for a following
sentence, and a comma does not end one. Another wants a requirement in the answering half and finds
a copula instead. A third needs the sentence to lower into clauses, and this shape frequently does
not lower at all.

The new arm keys on the repetition rather than on any vocabulary: both halves must share a subject
word and a verb form. Two unrelated facts joined by a comma share neither and stay clean.

Calibration is unchanged. Across a 39,793-word sample of the target register the rule reports 1.38
findings per 1000 words against 0.13 on hand-written control documents.

## 0.4.0

### POS tags were never populated (fix)

`buildDocAnalysis` is the path the CLI and the MCP server both run, and it left `pos` undefined on
every word. Every POS-gated lexicon entry therefore failed closed and could not fire in the shipped
package. That is 23 entries across five lexicons, among them `quietly` and `delve`, and both of
the verb lists that carry a POS gate.

The tagger now runs per unit and its tags are aligned to the scanned words. Nouns stay unmapped on
purpose, because the tagger's catch-all covers nouns and everything it could not place, so claiming
those are nouns would be a guess. Verbs, adverbs and adjectives map across.

### New rules

- `discourse/epistrophe` finds a run of sentences landing on the same two words. This is
  anaphora's mirror image and nothing was watching it, so a passage built on four sentences ending
  the same way scored zero.
- `discourse/conjunction-opener` treats a bare `And`/`But`/`So` opener as a document RATE rather
  than an instance. One of them is emphasis; one sentence in ten is a cadence. The floor sits at 3%
  of sentences, above the maximum measured in any hand-written document available for calibration.
- `claude/invitation` catches a conjured hypothetical used to open a sentence, where the reader is
  asked to picture a scene before the point arrives. A single instance reports at `candidate`, and
  three make it a habit.

### Better detection

- Two more forms of negative parallelism. Both were invisible because neither produces a complement
  for the IR to pair on. The first is a copula whose predicate is a prepositional phrase, so the
  denial and its replacement each land on a preposition. The second drops the predicate out of the
  answering half, which then ends on a bare copula. Both are matched on text, and both stand down
  wherever the IR path already reported that pair.
- `tricolon/comma-series` now weighs a shared opening word one step heavier. Naming three things is
  a list; saying one thing three times in the same frame is a figure of speech. Articles and
  demonstratives do not count, since English forces those before a noun.
- Commas inside brackets no longer split a series, and a list of names is no longer read as a
  tricolon.

### Library

New `lint/neighborhood.ts` with `runsOf()` and `neighborhoods()`, the two windowing shapes several
rules had each been reinventing.

## 0.3.0

### Reduction mode (new)

A different question from linting. Where the linter asks whether prose reads as
machine-written, reduction asks what a document could lose without its sentences
changing shape. It reports and never edits.

Candidates are ranked by how far below the diagram's baseline they hang.
Reed-Kellogg draws obligatory material on the line and everything optional
beneath it, so the notation supplies the ordering. Every candidate is verified by
cutting it and re-parsing: if the subject, verb or complement moves, it is
withdrawn.

```
node scripts/destink-score.mjs --reduce=3 [--reduce-to=150] <file>
```

- `--reduce=N` sets how deep to cut, 1 to 3. This is **its own dial**, unrelated
  to `--strictness`. 1 offers only material the diagram draws detached or
  parenthesised, 2 adds modifiers of modifiers, 3 adds any adjunct hanging off
  the baseline. Prints a reduction report instead of the lint report.
- `--reduce-to=N` stops once the document would reach N words, taking the
  deepest cuts first, and reports when the target cannot be reached without
  cutting into the baseline.
- `destink_reduce` is the same thing as an MCP tool, taking `text` or `path`,
  `markdown`, `level` and `targetWords`.

On a document of ordinary technical prose, level 3 offers around 3% by word
count. The module is explicit about what it cannot do: it knows what is
grammatically optional and nothing about what is worth keeping.

### Fewer false findings on markdown

- **Frontmatter is blanked.** A `---` (YAML) or `+++` (TOML) block on the first
  line, through its matching delimiter. Without this the keys lint as prose and
  the delimiters count as em dashes, so `title:` and `description:` became
  colon-reveals and the fences a density spike. No edit could remove them.
  On a measured 10-page Astro/Starlight site, 48 of 63 remaining structural
  findings were frontmatter.
- **A leading markdown marker is no longer a sentence opening.** Three bullets in
  a row were reported as anaphora because each line began with `-`. Bullets whose
  prose opens differently are now clean; three that genuinely do open the same
  way are still reported, naming the word instead of the punctuation.
- **Commas inside brackets no longer split a series.** A parenthesised
  enumeration carries its own commas, and counting them made the surrounding
  sentence read as a list it was not.
- **A name list is no longer a tricolon.** "Kavanaugh Latiolais, Michael and I
  get into this" is a byline. A real tricolon's items carry content; a name
  list's carry identity.

### New detection

- **The sufficiency reframe**, as in "It's not enough for the workloads to run,
  you also need to think about cost." The denial is copular and negated while
  the answer is neither, so the existing negative-parallelism rule could not
  pair the halves. It stays narrow by design, wanting a negated sufficiency
  answered by an explicit requirement rather than a denial answered by any
  clause.

### Strictness

`--strictness=3` now reaches `formatting/em-dash-density` and
`anaphora/repeated-opening`. A single em dash and a two-sentence run of the same
opening now report at level 3, where before they were silent at every level.

Rules honour the dial only where they were written to, six of forty-eight so
far. `docs/DESTINK.md` says which, and the remainder is tracked.

## 0.2.0

### `destink-mcp` (new)

The linter over stdio, published as a bin.

```
npx -y --package=sentences destink-mcp
```

- `destink_lint` takes `text` or `path`, plus `markdown`, `strictness` and a
  `format` (`summary`, `score`, `json`).
- `destink_rules` returns the rule set as data, so a caller can see what a clean
  report covers before trusting one.

Both read-only. Neither writes a file nor touches the network.

### Strictness dial (new)

`--strictness=N` on the CLI, `strictness` on the MCP tool. 2 is the default and
the level every threshold was calibrated against. 3 drops density floors and
raises severities a step, for text you already know a model wrote. 1 doubles the
floors.

### New rules

- `discourse/low-value-sentence` fires in a paragraph over 50 words, on a
  sentence whose every content word already appeared earlier in that paragraph.
- `discourse/trailing-tail` fires on a sentence that finishes its point and then
  adds a comma and one more phrase. It is gated on document rate, because the
  shape alone is ordinary English.

### Fixes

- **Sentence splitting is markdown-block aware.** A heading, its bullets and the
  paragraph under them used to fuse into a single unit, which silently disabled
  the suppression every rule relies on to stay out of headings and fences.
- `--help` prints to stdout and exits 0, rather than falling through the
  missing-file path.

### Library

A new `sentences/lint/run` export provides `lintDocument(text, options)`, the
whole pipeline as one call.

## 0.1.1

First published release. Rule engine, scorer and the `lint/*` exports.

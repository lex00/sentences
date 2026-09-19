# Changelog

Changes to the published `sentences` package that you would notice using it.
Internal refactors are left out unless they change a result.

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

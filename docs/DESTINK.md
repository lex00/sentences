# De-stink (Phase 10 / epic #28)

A deterministic trope linter built on the diagram engine: paste prose, get located findings, a
stink score, and mechanical fixes for the ones that can be fixed without guessing. It runs off the
same constituency parse and Clause IR the diagram tool already produces, plus a markdown-aware
scan for formatting tropes. No network call is required to lint a document.

## Pipeline

```
text
  │
  ▼
splitUnits (document.ts)            sentence boundaries, exact source spans,
  │                                  fragments kept as data ("Not a bug." IS a finding)
  ▼
parser-agnostic unit path           rule-based chunker by default, or a loaded ModelParser;
  │                                  a unit that fails to lower keeps its outcome + reason
  ▼
analyzeDocument (lint/analyze-document.ts)
  │                                  DocAnalysis: every unit's tree, POS-tagged words, and
  │                                  clauses, all mapped back to character offsets
  ▼
rule engine (lint/engine.ts, registry.ts)
  │                                  27 TropeRules across four tiers, run over the whole
  │                                  document; ordered + deduped output, isolated failures
  ▼
score + report (lint/score.ts, report.ts)
  │                                  weighted findings per 1000 words; a stable, versioned
  │                                  JSON schema for anything outside this repo to consume
  ▼
mechanical fixer (lint/fix/**)      closed edit vocabulary, monotone accept-iff-decrease loop
  │
  ▼
destink.html (src/destink/**)       paste, lint, highlight, score, diagram the finding
```

Each stage is a thin layer over the one before it. The parse and the IR are the same ones
`src/lower.ts` and `src/layout.ts` use for diagramming; this mode adds a rule layer and a score on
top rather than a second parser.

### Document pipeline

`splitUnits` breaks the input on sentence-ending punctuation and keeps exact character spans for
every unit, so a rule's finding can always be sliced straight out of `doc.text`. A unit that
doesn't lower to a clause is not dropped: `readDocument` records it as a fragment (no verb at all,
the strongest signal a countdown or punchy-fragments rule looks for) or unparseable (a verb is
there, the parse just failed). `analyzeDocument` then runs each unit through the parser-agnostic
path (`Parser` seam: rule-based by default, a loaded `ModelParser` for a second, richer pass) and
tags every word with its source offsets, so a rule that flags one word reports characters an editor
can underline, not a token index into a stream the caller has to re-derive.

### Rule engine

Twenty-seven rules across four tiers: lexical (word lists with POS gating), syntactic (structural
patterns over the Clause IR), formatting (markdown-aware, parser-free), and discourse
(cross-sentence density: repetition, anaphora, dilution). Density is the deliberate design
constraint. A prompt-based judge reading one sentence at a time cannot tell "one tricolon is style"
from "three in a row is a pattern"; a rule that sees the whole `DocAnalysis` can, so every threshold
lives inside `detect()` and the runner (`runRules`) stays a dumb loop over predicates. The runner
guarantees three things no rule has to re-implement: deterministic ordering (span start, span end,
rule id, never locale-dependent), dedupe on identical rule id and span, and isolation (a rule that
throws contributes nothing, and everyone else still runs). Every rule ships with a fixture file
(`lint/fixtures/`, checked by `fixture-battery.test.ts`): a positive that must fire on an exact
span, negatives that must stay silent, and cross-rule checks that a negative for one rule doesn't
trip another. That battery is what keeps a rule's wording from drifting silently as the lexicons
grow.

### Score and report

`scoreFindings` turns findings into one number: weighted count per 1000 words, split by tier and by
rule. Weights double per severity (candidate 0.25, low 1, medium 2, high 4) rather than climbing
linearly, so one glaring `high` outweighs several `low`s and a pile of minor tics can't out-shout
it. `buildReport` wraps that into a versioned JSON object (`version: 1`) with explicit key order and
no run-dependent values, so two runs over the same input are byte-identical and an external tool
can diff two reports without also diffing formatting noise. This report, not the internal
`TropeRule`/`Finding` types, is the contract anything outside this repo is meant to parse.

### Mechanical fixer

A fixer only gets three edit kinds: delete a span, move a span to another offset in the same
text, or repair a span with a replacement that differs from the original only by whitespace or
punctuation at the edges and, at most, a case flip on the first letter (`fix/types.ts`'s
`isValidRepair`). A fourth kind, an unrestricted replace that inserts new wording, is not part of
the vocabulary at all. The output of a fix is always a subsequence of the author's own words plus a
small amount of seam cleanup, so it cannot introduce a
tell that wasn't already in the source, and a fixer's own correctness never has to be argued: the
loop measures it. `fixLoop` (`fix/loop.ts`) applies a candidate fix, re-lints from scratch, and
keeps the result only if the finding count strictly fell, nothing in the diff counts as a new
finding under span remapping, and no rule started throwing that wasn't throwing before. Anything
else reverts, byte for byte. The loop terminates because the measure `(findings remaining,
un-rejected candidates)` strictly decreases every iteration under a well-founded order; a fix that
requires a judgment call (which item of a four-item pile to cut) is exposed through a proposals API
instead of an automatic edit, for the app to offer as a choice rather than a decision the loop
makes on its own.

### App

The user-facing page is `destink.html`, wired up by `src/destink/main.ts`, which runs two passes
over whatever the reader pastes in. A fast pass runs `buildDocAnalysis` synchronously with no
download, and a neural pass re-lints in place once a `ModelParser` finishes loading (lazy on focus,
same pattern as `free.ts`), giving the syntactic-tier
rules a second look with real POS tags. "Diagram the finding" (`diagram-finding.ts`) renders the
sentence a finding came from as a Reed-Kellogg diagram with the offending span lit up, so a rule
that says "reframe" or "tricolon" can show its work instead of asserting it.

## Oracle-gated: what stays out, and why

Everything above is offline and deterministic: same input, same findings, same score, every time.
That is the design boundary, and it is deliberate. The natural next step, having a model propose
replacement text for a flagged span, does not live in this repository.

The reasoning from the epic (#28) is structural, not a matter of taste:

- **Negative constraints don't compose.** Telling a model "don't use em dashes, don't use
  tricolons, don't use the reframe" for a dozen tropes at once degrades the rest of the output long
  before it reliably avoids all of them.
- **Models can't count.** Most of what a trope IS, here, is a density judgment: one em dash is
  punctuation, six per thousand words is a tic. A model asked to fix a paragraph is not counting its
  own em dashes across the page; a rule holding the whole `DocAnalysis` is.
- **A whole-text rewrite re-rolls clean text.** Ask a model to rewrite a paragraph and the parts
  that were already fine get rewritten too, at fresh risk of a different tell. There's no way to
  tell whether the rewrite helped without reading it end to end again.

The oracle-gated design puts the model, if there is one, downstream and narrow instead of upstream
and broad: given this repo's JSON report, an out-of-repo tool could propose new text for the
flagged spans only, apply the patch, and re-run this linter to decide whether to keep it, accepting
a step iff findings strictly decreased, exactly the mechanical loop's own acceptance rule applied to
model output instead of a fixer's. That loop is a separate CLI or repository: it needs network
access and API keys, which this project (a static site with no server) does not carry, and it is
gated by re-lint against the same rules documented here rather than by the model's own say-so about
whether it fixed the text.

## Scope

Covered: the syntactic, lexical, formatting, and measurable-discourse tiers. "Measurable" is the
operative word for the discourse tier: repetition (including near-duplicate paraphrase), anaphora,
and dilution are counts and comparisons over the parsed document, not judgments about what the
prose is trying to do.

Not covered, and not claimed: semantic tropes. Stakes inflation, false vulnerability, and dead
metaphors beyond simple lemma repetition are about what a passage means and how it lands on a
reader, not about a structure a parser can point at. `dead-metaphor.ts` catches a metaphor word
reused past a repetition count; it has no opinion on whether a metaphor is apt. A parser has no way
to tell a true stakes claim from an inflated one, so this tool doesn't try, and a clean score here
is not a claim that the prose is good, only that it is free of the structural and lexical tells this
rule set can name.

## The CLI

```
node scripts/destink-score.mjs <file>
```

Runs the file through the same steps the app's fast pass uses (build the document analysis, run
the enabled rules, build the report) and prints the report as JSON on stdout. No build step, no
bundler: the script type-strips its own `.ts` imports via Node's native support
(`--experimental-strip-types` on Node 22.6+, on by default on Node 23+) and refuses to run rather
than pull in a transpiler dependency on an older Node.

The number that matters is `score.total`: weighted findings per 1000 words, floored against a
100-word minimum so a short fragment can't produce a score with no comparison value. `score.byTier`
and `score.byRule` break that number down for anyone deciding which tell to chase first.

## Known engine limits

The rule-based (zero-download) path shares the same chunker the diagram tool uses, so a gap in the
chunker is a gap in both. Two examples of that gap being closed:

- **#31**: the rule-based tagger lost the contracted copula ("It's not bold" tagged with no verb
  at all), which meant the reframe rule's flagship pattern, "It's not X. It's Y.", produced two
  fragments instead of two copular clauses on the no-model path. Fixed; the rule-based path now
  lowers it.
- **#33**: the chunker dropped the `as`-phrase after `serve`/`stand` ("serves as a reminder" parsed
  down to just "serves") and dropped a trailing comma-set-off participial phrase entirely: a
  sentence ending "...opened in 1994" used to lose the clause that followed it altogether. Fixed;
  both rules now fire through the IR path on the rule-based parser, not only once a neural parse
  loads.

Two gaps remain open, tracked on #32:

- **No-initial countdown.** `readDocument` currently lowers "No warning." to a clause rather than a
  fragment, so a countdown that opens with a determiner "No" ("Not ten. Not fifty. No excuse.")
  only fires under the stub analyzer used in tests, not through the real rule-based path.
- **N-item compounds from comma lists.** The rule-based chunker does not build a genuine N-item
  `Compound` out of raw comma-separated text; it merges the conjuncts into one head instead. That
  caps tricolon recall, and the tricolon-trim fixer's applicability, on the no-model path until a
  neural parse is available.

Neither gap changes a finding that already fires; both are recall gaps on the free path, closed the
same way #31 and #33 were: by teaching the chunker the shape, not by adding a special case to a
rule.

## Sources

- **tropes.fyi**, a taxonomy site by ossama.is. This is the trope list the rule set here tries to
  catch structurally, and the same list this repository's `CLAUDE.md` ships so an assistant keeps
  its own prose out of these patterns. Rule names and explanations throughout `src/lint/rules/` and
  `src/lint/lexicons/` follow its category names on purpose, so a finding's message names the same
  trope a reader would recognize from that site.
- **skill-deslop**, a prompt-based Claude skill by Stephen D. Turner (repository
  stephenturner/skill-deslop on GitHub, MIT license) that targets the same problem with hand-curated
  phrase catalogs instead of a parser. Cited here twice over: a handful of lexicon entries in
  `src/lint/lexicons/` adapt phrases from its catalogs under that MIT license, and it is the
  obvious first benchmark for the scorer. Score a slop fixture before and after running it through
  skill-deslop, and the delta says what the prompt approach fixed and what it left standing. That
  comparison is tracked as a follow-on on #32.

## See also

`docs/PARSER.md` and `docs/RK-FIDELITY.md` document the parse-to-diagram pipeline this mode reuses.
`ROADMAP.md` Phase 10 is where this epic sits in the project's history.

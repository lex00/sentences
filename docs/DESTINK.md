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
  │                                  48 TropeRules across four tiers, run over the whole
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
every unit, so a rule's finding can always be sliced straight out of `doc.text`.

Sentences are split one markdown BLOCK at a time (`lint/blocks.ts`), and the reason is a bug that
hid for months. `splitUnits` breaks on `. ! ? ; :` and nothing else, which is right inside a
paragraph and wrong between blocks, because most blocks carry no terminal punctuation: a heading,
its bullet list and the paragraph under them came back as a single fused unit, and since the fused
span was not wholly inside any one block, `inKind(ctx, span, "heading")` answered false for all
three — silently disabling the suppression every rule leans on to stay out of headings, bullets and
fences. The opposite mistake is just as easy: `stub-doc.ts` used to break on every newline, which
shreds hard-wrapped prose into half-sentences, and this repository's own docs are hard-wrapped. So
the two document builders were each wrong in the direction the other was right, and neither could
see it — fixtures run through the stub, production runs through the other, and nothing compared
them. Both now split through `blocks.ts`, and `blocks.test.ts` pins the invariant that catches the
whole class: no unit from either builder may straddle a block boundary, checked on constructed
cases and on the real documents in `docs/`. `document.ts` itself is untouched, deliberately — it is
shared with the Reed-Kellogg diagram path, where a document is one sentence somebody typed and
markdown blocks are not a thing. A unit that
doesn't lower to a clause is not dropped: `readDocument` records it as a fragment (no verb at all,
the strongest signal a countdown or punchy-fragments rule looks for) or unparseable (a verb is
there, the parse just failed). `analyzeDocument` then runs each unit through the parser-agnostic
path (`Parser` seam: rule-based by default, a loaded `ModelParser` for a second, richer pass) and
tags every word with its source offsets, so a rule that flags one word reports characters an editor
can underline, not a token index into a stream the caller has to re-derive.

### Rule engine

Forty-eight rules across four tiers: lexical (word lists with POS gating), syntactic (structural
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

Each fixture also declares which profile it belongs to, and the default does real work. A `shape`
fixture makes a claim about what the rule structurally is — "a trailing phrase opening on `which` is
a relative clause, not this rule's business" — which is true at every strictness level, so the
battery runs it at all three. That is what turns the dial's central promise into something CI
enforces rather than a sentence in a header: if level 3 ever starts reporting a shape a rule had
positively excluded, a negative fails. A `rate` fixture makes a claim about a density threshold
("three trailing tails is under the floor"), which is true at level 2 and false at level 3 by
design, so it is checked at the default level only and the rule's own test file pins the rest.
`shape` is the default because when the dial landed, 389 of the directory's 393 fixtures already
behaved identically at all three levels, and the four that did not were every one of them a
threshold claim. A hygiene check runs the other way too: a fixture marked `rate` whose behavior
never changes across the dial is a shape fixture wearing a rate label, narrowing what CI checks for
nothing, and the battery says so.

The discourse tier is where a rule's scope stops being one sentence, and the three repetition rules
divide that scope deliberately. `repetition/near-duplicate` compares units pairwise across the whole
document by character 4-gram cosine, which catches a sentence written twice. `repetition/dilution`
measures what fraction of the document's overlapping 3-word runs restate an earlier one, a
dependency-free stand-in for a compression ratio (`node:zlib` is off-limits — rule code ships to the
browser build). `discourse/low-value-sentence` covers what neither of those can reach: inside one
paragraph of more than 50 words, a whole sentence whose every content word was already on the page.
A sentence can fail that test while sharing almost no surface wording with anything before it, which
is the padding the other two miss. Scoping it to the paragraph is what keeps it away from the
ordinary way a new paragraph picks up the previous one's vocabulary, and a substantial sentence that
brings exactly one new content word reports as a `candidate` instead, at quarter weight, because
nothing structural separates padding from a real synthesis there. Content words come from the shared
function-word list and inflection folding in `lint/content-words.ts`, which errs toward folding too
little: a word that doesn't fold reads as new material, so the rule stays quiet rather than firing
on a sentence that did introduce something.

`discourse/trailing-tail` is the fourth of these and the one that admits its own limits loudest. It
reports a sentence that finishes its point and then adds a comma and one more phrase — "…produces a
parse, with a rule-based fallback parser". The shape is ordinary English: measured across this
repository's own six documentation files, 5040 words, the narrowed form occurs 15 times, 2.98 per
1000 words, and every one of those is doing real work. Nothing structural separates them from the
phrase appended because the sentence felt too short, so the rule does not try per sentence. It
excludes the tails whose job is visible from their first word (coordination, relative clauses,
subordinators, the `, not X` contrast that `contrast-tail` owns, the `-ing` tack-on that
`ing-tackon` owns, and anything carrying its own predicate) and then gates on the RATE, at twice the
measured human figure. Everything reports at `candidate`. At strictness 3 the gate disappears and it
becomes a flat prohibition, which is the setting for someone who does not want the shape at all.

### Strictness

Every threshold in the rule set is calibrated against deliberate human prose. `trailing-tail`'s
floor is twice the rate measured across this repository's own documentation; the em-dash threshold
had to stop flagging Melville (#35). That calibration is right for the default and wrong for the job
somebody actually has, so the floors move together on one dial (`lint/strictness.ts`), passed to
`runRules` and handed to every rule's `detect`:

| level | floors | severities | for |
| --- | --- | --- | --- |
| 1 | doubled | eased one step | prose with a voice you are trying not to flatten |
| 2 | as written | as written | the default, and what every rule file argues for |
| 3 | zero | raised one step | text you already know a model wrote |

Level 3 is the one with teeth. A density gate stops gating — `hits.length >= 0` is true of any
non-empty set — so one instance of a shape reports the same as six, and `trailing-tail` turns from a
rate detector into a prohibition. On the flip-flop family (`reframe`, `setup-turn`,
`mirrored-clauses`), which already fire on a single instance, the dial moves severity instead: the
same three findings on one paragraph score 7.5, 22.5 and 50 at levels 1, 2 and 3.

What the dial never does is invent a finding a rule could not otherwise make, or relax a rule's
structural narrowing. Level 3 does not make `trailing-tail` report a relative clause. Counts and
severities are a judgment about how much is too much; what counts as the shape at all is the rule's
own business at every level, and only the first of those is a matter of taste. A rule with no
density component behaves identically at all three levels, which is the honest answer for it.

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

## Oracle-gated: what stays out, and what referees it

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
and broad: given this repo's JSON report, something outside it proposes new text for the flagged
spans only, and this repo decides whether that text is allowed to stand. The linter referees; the
model edits. Proposing needs network access and API keys, which this project (a static site with no
server) does not carry, so that half stays out. Refereeing needs neither, so it lives here, in
`lint/fix/oracle.ts`.

`refereeEdit` takes one finding's span and a replacement string, applies it, re-lints, and accepts
only if four things hold: no rule started throwing, **nothing at all is reported inside the new
text**, every finding outside the replacement matches a pre-edit finding under pure offset shifting,
and the total count strictly fell. Anything else and the caller gets its text back byte-for-byte
with the reason.

The mechanical loop (`fix/loop.ts`) cannot do this job, and the reason is worth stating. Its
acceptance test asks that every finding in the new result be the remapped image of one that was
already there, and `apply.ts`'s `remapSpan` refuses to follow any span a word-changing splice
touched. Arbitrary replacement text is word-changing by definition, so every finding near the edit
becomes unfollowable, reads as new, and the step is refused. That rule is right for splices of the
author's own words and useless for prose somebody else wrote; what replaces it is a scope test
rather than a following test.

The guarantee is weaker than the fixer's, and the difference is the point. The mechanical loop
promises the final text is the author's words with some removed and its findings a subset of the
findings it started with — a subset, not "probably better". An accepted oracle edit promises
strictly fewer findings, nothing new anywhere, and every part of the document the model was not
editing provably unchanged. What it cannot promise is that the new words are the author's, because
they are not. That judgment stays with the person reading the result, which is why nothing in that
module writes a file.

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
node scripts/destink-score.mjs [--markdown] [--strictness=N] <file>
```

Runs the file through the same steps the app's fast pass uses (build the document analysis, run
the enabled rules, build the report) and prints the report as JSON on stdout. No build step, no
bundler: the script type-strips its own `.ts` imports via Node's native support
(`--experimental-strip-types` on Node 22.6+, on by default on Node 23+) and refuses to run rather
than pull in a transpiler dependency on an older Node.

The number that matters is `score.total`: weighted findings per 1000 words, floored against a
100-word minimum so a short fragment can't produce a score with no comparison value. `score.byTier`
and `score.byRule` break that number down for anyone deciding which tell to chase first.

The four-step sequence itself lives in `src/lint/run.ts` as `lintDocument(text, options)`, which
this script, the MCP server and the package's `sentences/lint/run` export all call. The step order
carries weight and is easy to get subtly wrong: `--markdown` changes what the *rules* see, never what
the report is built from. `extractProse` blanks markdown to spaces rather than deleting it, so the
extracted string has the same length as the original and every span in the report still indexes the
file on disk, provided the report is built from the original text. One function, one ordering,
four callers.

## The MCP server

```
npx -y --package=sentences destink-mcp
```

The linter over stdio, for an agent that is writing prose and wants it checked against the same
rules and the same score the app and the CLI use. `src/mcp/server.ts` is the transport wiring and
the tool declarations; `src/mcp/tools.ts` is what the tools mean, with no MCP import in it, so the
behavior is tested by calling functions rather than by speaking JSON-RPC at a subprocess.

Two tools, both read-only:

- `destink_lint` takes `text` (a draft the caller is holding) or `path` (a file to read), plus
  `markdown` (defaulted on for a `.md`/`.markdown`/`.mdx` path, overridable either way), and a
  `format`. `summary` renders each finding as `line:col` with the offending excerpt and the
  explanation, printed once per rule rather than repeated down a run of findings. `score` drops the
  located findings and keeps the counts, which is the cheap call for "did my edit help?". `json` is
  the report verbatim, byte-identical to what the CLI prints for the same input.
- `destink_rules` lists the rule set (id, tier, name, in registry order) so a caller can tell what
  a clean report actually covers before trusting one.

Spans are the reason the renderings exist. A half-open character range is right for an editor and
useless to a model holding the document as text, so `summary` converts each one to `line:col` plus
the words themselves.

Argument errors and unreadable paths come back as `isError` content rather than thrown exceptions:
a protocol-level error is something the calling model never gets to read, and a mistyped key is
exactly the kind of thing it could fix if told. Unknown keys are rejected for the same reason:
`{"file": "README.md"}` quietly linting nothing and reporting a clean document is a worse outcome
than an error naming the keys that do exist.

What the server deliberately does not expose is the mechanical fixer (`src/lint/fix/`). It edits an
author's words, and whether a given edit ships is a call for the agent holding the document and the
human reading it, not for a linter reached over a socket.

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

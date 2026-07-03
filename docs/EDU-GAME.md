# Using this project as the basis for an education game

Notes on what the current codebase provides toward a grammar-teaching game, and what such a game
would still need. The short version: the hard, novel work (turning a sentence into a correct
Reed-Kellogg structure) is done and is the reusable core. A game adds an interaction and pedagogy
layer on top of it, and can drop the two biggest liabilities of the display tool.

## The reframe: from "generate" to "grade"

The display tool takes a sentence and produces the correct diagram. A teaching game usually runs
the other way: the student builds or labels the diagram, and the tool checks the attempt and gives
feedback. The correct diagram is the answer key, not the output.

This is a good fit for the existing architecture, because the **IR is already the answer key.**
`src/ir.ts` (Clause / Nominal / Verbal / Modifier / Complement / …) is a precise, role-labelled
model of a sentence's structure. Grading a student's attempt is comparing their placements against
that IR.

Two liabilities of the display tool become non-issues for a game:

- **The 72 MB neural parser can be dropped at runtime.** Game content should be a fixed bank of
  pre-verified sentences, not arbitrary live input. So the parser is an *authoring-time* tool
  (parse once, a human accepts/corrects, freeze the IR), and the shipped game carries only
  `{ sentence, verifiedIR }` records. No model download, no WASM, tiny payload.
- **Parse correctness stops being a runtime risk.** A game must never teach a wrong diagram; a
  curated, human-checked bank guarantees that. The N-best + correction work (ROADMAP Phase 9) is
  exactly the authoring tool for building that bank.

## What is directly reusable

- **The IR** — the answer key and the grading target.
- **`layout()` → Scene** — renders any IR, including hand-authored/curated IR, with no parser.
- **Stable structural node ids** (`SceneNode.id`) — address individual parts for selection,
  scoring, hints, and highlight.
- **`hitTest(scene, point)`** (`src/scheduler.ts`) — the pointer-to-part primitive for clicks/taps.
- **Effects + morph** — `draw-on`, particle feedback, and the diff-and-tween Animator give correct
  or incorrect answers immediate visual response, and smooth transitions between states.
- **Themes** — swap visual identity for a younger audience without touching geometry.
- **The collision detector** — can validate that a student-built layout is well-formed.
- **SVG export** — worksheets, sharing, printing.
- **Static-site delivery** — already offline-capable and serverless; a game inherits that.
- **The construction taxonomy** — `parser-export/sentences.txt` is grouped by construction
  (38 group headings), an implicit difficulty curriculum: subject/verb → modifiers → objects →
  PPs → compounds → clauses → verbals → the long tail.

## What is missing (the game layer)

None of this exists yet; the current code is a renderer, not an app.

1. **Interaction / input.** Today the diagram is read-only. A game needs the student to act:
   drag words onto slots, draw lines, label a line by picking a role, or answer a
   multiple-choice identification. Requires input capture and an editable/partial Scene.
2. **A grader.** An IR comparator that maps student actions to IR nodes and scores them:
   per-node correct/incorrect, partial credit, "what's wrong and where". The stable ids make this
   tractable.
3. **Partial / blank diagrams.** Show a diagram with gaps for the student to fill. `layout()`
   would need to render placeholder slots, not just complete structures.
4. **Feedback / pedagogy.** Role-keyed hints and explanations ("a direct object receives the
   action of the verb"), and error-specific messages. Derivable from the IR node types.
5. **Game shell.** Levels/curriculum (reuse the taxonomy), scoring, streaks, retries, progression,
   and persistence (localStorage). None exists.
6. **Audience-appropriate UX.** Mobile/touch, larger targets, audio, simpler visuals. The current
   UI is a developer demo.

## Suggested build order

1. **Content bank + authoring.** Curate sentences by construction, parse each, accept/correct via
   the Phase 9 tooling, freeze `{ sentence, verifiedIR }`. Ship the bank; drop the runtime model.
2. **Identify-the-part mode (easiest).** Render the correct diagram, ask "click the direct
   object"; grade with `hitTest` + IR roles. Reuses everything, needs no editing.
3. **Grader + feedback layer.** The IR comparator and role-keyed hints, shared by all modes.
4. **Build/label modes.** Drag words into slots, then draw-the-lines; needs the editable/partial
   Scene and input capture.
5. **Game shell + progression.** Levels from the taxonomy, scoring, persistence, kid-friendly UX.

## Notes and risks

- Keep the IR as the single contract. Every mode grades against it; every renderer draws from it.
  Do not let game state leak into layout or the IR.
- The authoring bank is the quality gate. A wrong frozen IR teaches a wrong answer, so authoring
  needs the human-in-the-loop correction (Phase 9 part 2) before the bank is trustworthy.
- Reed-Kellogg is English-pedagogy-specific. A multilingual game would need a different notation
  or a dependency-tree view (the IR is the intended convergence point for that later path).
- Difficulty is already latent in the taxonomy; formalizing it as ordered levels is mostly content
  curation, not engine work.

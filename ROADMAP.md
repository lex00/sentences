# Roadmap

> Living document. The early phases de-risked the novel core (**footprint layout** and the
> **diff-and-tween + executor seam**) before parser or GPU work; those risks are retired. The
> frontier has moved: the engine now does automatic constituency-parse → Reed-Kellogg in the
> browser, so the remaining phases close the gaps between that and *beating every available
> tool* — export, ambiguity/correction, real-prose robustness, and actually shipping it. See
> `DESIGN.md` for the architecture and `RESEARCH.md` for the motivating gap and landscape.

## Status (2026-07-01)

The full pipeline runs end to end **entirely in the browser**: text → neural constituency parse
→ `Clause` IR → footprint layout → `Scene` → executor. Phases 0–7 are complete; the remaining
work (Phases 8–11) is the set of gaps that separate "the only working auto-R-K in a browser"
from "unambiguously beats every available tool" — see **Capability position** below.

- ✅ **Phase 0** Scaffold — Vite+TS, canvas, type contracts
- ✅ **Phase 1** IR + fixtures — superseded by layout(); IR fixtures remain
- ✅ **Phase 2** Animator + Canvas executor (RISK 1 retired)
- ✅ **Phase 3** Footprint layout engine (RISK 2 retired)
- ✅ **Phase 4** Theme variants (default + blueprint) + compound (fork) & subordinate-clause
  (nesting) layout. Clause arrangement refactored into a placeable `Measured` so clauses nest.
- ✅ **Phase 5** Effects as data: EffectScheduler (bindings -> instances), Canvas draw-on +
  CPU particle sim (executor-owned state, seeded RNG), shader binding skipped via supports().
  **Perf wall:** `npm run bench`.
- ✅ **Phase 6** Parser -> IR bridge: ptb.ts (bracket parser) + lower.ts (constituency -> Clause
  IR — the converter no tool provides). End-to-end test: parser output lays out with the SAME
  ids as the hand-built fixtures.
- ✅ **Phase 6b** Interim client-side parser: compromise POS + rule-based chunker -> PTB Tree
  -> lower(). Proved the no-server path; superseded as primary by 6c.
- ✅ **Phase 6c** In-browser **NEURAL** parser (`src/parser/`): benepar (T5-small + partitioned
  encoder + 123-label span head) exported to ONNX (int8, ~72 MB, lazy-loaded from
  `public/models/`); CKY chart decoder + T5 SentencePiece tokenizer ported to TS; run via ONNX
  Runtime Web (single-thread, no COOP/COEP) with a rule-based fallback. Now the primary parser.
- ✅ **Coverage + correctness harness.** `lower.ts` covers imperatives, questions (SQ/SBARQ),
  relative / noun / adverb clauses, gerund / infinitive / participle verbals (stands + curves),
  appositives, correlatives (both/either/neither), indirect + objective complements, causative
  small clauses, and absolute phrases. A **90-sentence battery** drawn from real diagramming
  lessons runs parse→lower→layout→collision + dropped-word detection: **90/90 clean — 0 lowering
  errors, 0 dropped words, 0 collisions**. `scripts/battery-check.mjs`.
- ✅ **Collision oracle.** Geometric overlap check (SAT on oriented boxes, cap-height sizing,
  segment-through-label detection) over pinned Tinos metrics shared by the renderer and tests —
  the automated correctness gate. Committed 42-sentence regression sweep (`collisions.test.ts`).
- ✅ **Phase 7** WebGPU executor (`webgpu-renderer.ts`) — HYBRID: Canvas2D scene + GPU
  instanced soft-glow particles (WGSL). `makeExecutor()` falls back to Canvas when WebGPU
  absent. **⚠️ BUILT BUT UN-RUN** — no GPU/browser in the env; needs in-browser verification.

180 tests across 22 files. 43 commits, **local git only — no GitHub remote, not deployed.**

### Perf-wall finding (Phase 5)

The particle **sim** is not the Canvas2D wall: 1,000,000 particles update in ~2.24ms (13% of a
60fps frame). The entire Canvas2D ceiling is **rasterization** (per-particle `arc()` + `fill()`
with `lighter` compositing), not the math — which is the WebGPU win (Phase 7). Remaining to
measure: the in-browser raster FPS curve. The node bench is the CPU-sim floor only.

## Capability position (vs. the RESEARCH.md landscape)

RESEARCH.md's headline finding: **no maintained tool auto-converts an NLP parse to Reed-Kellogg.**
The one tool that ever did (1AiWay) runs on Silverlight — dead, fails in modern browsers, Windows
app fallback only. Every R-K tool that works today is a manual editor (SentenceVizu, SenDraw,
SenGram); the robust parsers all stop at dependency/constituency trees.

**What this project now has that no maintained tool does:**
- Automatic **constituency-parse → R-K**, running entirely client-side in a current browser.
  1AiWay needed a dead plugin; this needs nothing but the page.
- Construction coverage (list above) broader than 1AiWay's documented limits ("first sentence
  only; fails on long/legal/poetic").
- A geometric collision oracle gating correctness — nothing in the survey has an equivalent.

**Gaps that keep "exceeds all available tooling" a *qualified* claim** — these define the
forward roadmap, ordered by how much each closes the gap:
- **No export.** RSyntaxTree / SentenceVizu emit SVG/PNG/PDF; this renders to Canvas/WebGPU
  only, so a diagram can't leave the tab. → **Phase 8**
- **Single-answer UI + no correction.** `lowerNBest` exists but only in tests; ambiguity isn't
  surfaced, and a wrong auto-diagram can't be fixed in place — the one thing manual editors
  always beat an automatic tool on. RESEARCH.md flags N-best as unavoidable. → **Phase 9**
- **Validated only on curated pedagogical text.** 90/90 is real but bounded; arbitrary prose
  will surface lowering gaps. → **Phase 10**
- **Not deployed / not on GitHub.** "Delivered via browser" is true of the build, not of access
  — no one can reach it. → **Phase 11**
- **WebGPU path never run in a real browser.** → Phase 7 verification (carried).

## Sequencing principle

De-risk before you build wide. The novel, could-sink-the-project parts are (1) the 2-D
footprint / non-overlap layout rule and (2) whether the portable Animator + executor seam
actually holds. Both can be proven against **hardcoded Scenes**, with no parser and no GPU.
Everything else is comparatively known plumbing, so it comes after the risks are retired.

---

## Phase 0 — Scaffold
**Goal:** a runnable TS project with the type contracts stubbed.
- Vite + TS, a blank canvas on a page, hot reload.
- Define the data contracts as types only: `Clause`/IR, `Scene`/`SceneNode`/`Prim`/`Role`,
  `Theme`, `Transition`, `EffectDesc`, `EffectBinding`, `EffectExecutor`, `Clock`.
- No logic yet — just the shapes from `DESIGN.md` compiling.
**Exit:** `npm run dev` shows a blank canvas; all contracts type-check.

## Phase 1 — IR + Scene fixtures
**Goal:** handwritten Scenes to render and animate against, bypassing parser + layout.
- Author 3-4 `Scene` fixtures by hand (e.g. "The small dog barked loudly.", "the man in the
  house") with stable structural ids.
- A two-state pair (sentence A → edited sentence B) for the morph test.
**Exit:** fixtures are valid `Scene` trees; ids are stable and structural.

## Phase 2 — Animator + Canvas executor  ◄ RISK 1
**Goal:** prove the portable spine and the executor seam with real morph.
- `Animator.diff(prev, next)` → enter/update/exit transitions, keyed by stable id.
- Tween scheduler over an injectable `Clock`; `update` transitions interpolate geometry.
- Canvas2D `EffectExecutor.drawScene(scene, theme)` — static draw of a Scene first, then
  driven each frame by the tweened scene.
- Wire fixture A → B: watch the diagram **morph**, not snap.
**Exit:** editing between two hardcoded Scenes produces a smooth reflow; the executor only ever
receives a Scene + instances, never grammar. Seam altitude validated.

## Phase 3 — Layout engine  ◄ RISK 2
**Goal:** replace hardcoded Scenes with real `layout(IR) → Scene`.
- `measure` (bottom-up) returning `Footprint { baselineWidth, below: BBox }`.
- `arrange` (top-down): S │ V [half/lean] complement; recurse PP sub-rails.
- The **non-overlap rule**: `gap = max(dividerGap, belowᵢ.right − belowᵢ₊₁.left)`.
- Text metrics via canvas `measureText` (the shared adapter).
- Structural id assignment (feeds Phase 2's diff).
**Exit:** the Phase 1 fixtures regenerate from IR with no overlap; heavily-modified words push
neighbors correctly; morph still works because ids stayed stable.

## Phase 4 — Theme + role coverage
**Goal:** the role→appearance seam, and full notation coverage in geometry.
- `Theme` implementations (≥2: clean-minimal + one stylized) over the same Scene.
- Strict `LayoutStyle` vs `RenderStyle` split — verify no renderer touches layout style.
- Layout cases beyond the core rail: **compound** (fork + dotted conjunction) and
  **subordinate clause** (pedestal/stilt + dotted connector). *(Biggest layout gap — see
  DESIGN open decisions.)*
**Exit:** two visually distinct themes from identical geometry; compounds and one subordinate
clause type render correctly.

## Phase 5 — Effect bindings + Canvas effects
**Goal:** effects as data; capture the WebGPU justification.
- `EffectBinding` resolution (selectors on role/event → `EffectDesc`).
- Canvas executor: `draw-on` reveal, `fade`, CPU `particles` (own sim state, instances in).
- `shader` bindings present but `supports()===false` → no-op (deferral proof).
- **Measure the performance wall**: particle/element count where Canvas2D drops frames.
**Exit:** staged-reveal + particle effects fire from bindings; the perf-wall number is written
into this doc as the WebGPU rationale.

## Phase 6 — Parser → IR
**Goal:** real sentences in.
- benepar (constituency) → `Clause` IR lowering. Constituency, not UD dependency.
- N-best handling: ambiguous parses → multiple IRs → user picks / cycles.
- Graceful failure on long/rare/poetic input (the known auto-generation limit).
**Exit:** type a sentence, get a correct auto-diagram for common cases; ambiguity surfaces
alternatives rather than guessing.

## Phase 7 — WebGPU executor
**Goal:** the rich-graphics payoff; shaders light up.
- WebGPU `EffectExecutor`: GPU particle sim (compute), instanced draw.
- Implement the deferred `shader` pass: glow/bloom/ink-bleed/distortion.
- Same bindings + Scene + Animator as Canvas — only the executor swaps.
**Exit:** shader bindings authored back in Phase 5 now render, with zero changes outside the
executor.

## Phase 8 — Export (SVG first)  ◄ closes the clearest parity gap
**Goal:** shareable, reusable output — the one capability RSyntaxTree and SentenceVizu have and
this doesn't. SVG is the consensus target (RESEARCH.md).
- `Scene → SVG` serializer: same geometry as Canvas, roles → styles via the existing Theme seam.
- PNG via canvas raster; PDF optional.
- Download control in `main.ts`.
- Snapshot-test the SVG so geometry regressions are caught alongside the collision sweep.
**Exit:** any diagram exports to a standalone SVG that renders identically offline.

## Phase 9 — Ambiguity + correction  ◄ the manual-tool parity
**Goal:** stop being confidently wrong with no recourse; present alternatives instead of guessing.
- Surface `lowerNBest`: when parse/lowering yields alternatives (PP-attachment, etc.), show them
  and let the user cycle/pick. 1AiWay emitted multiple diagrams; match that.
- Minimal correction: re-attach a modifier, re-pick the head/subject — edit the IR and re-lay
  out. The diff-and-tween morph (Phase 2) already animates a live relayout, so this is IR edits
  + a small UI, not a new engine.
**Exit:** a wrong auto-diagram can be fixed in place; ambiguous sentences offer alternatives.

## Phase 10 — Robustness beyond pedagogical
**Goal:** hold up on real prose, not just lesson sentences.
- Grow the battery with non-curated text (news, fiction, user-submitted); track a **known
  lowering-gap set** the way the corpus sweep tracks unsupported parses.
- Broaden lowering for the gaps that surface; on parses it genuinely can't diagram, **label the
  failure — never silently drop words** (the dropped-word detector already measures this).
**Exit:** a defined real-text corpus runs with a measured, shrinking gap set and zero silent drops.

## Phase 11 — Publish + deploy
**Goal:** make "delivered entirely via browser" literally reachable.
- Push to GitHub; add a permissive license (matches the reusable-building-block framing in
  RESEARCH.md; benepar/Stanza/RSyntaxTree precedent).
- Static deploy; confirm the ~72 MB model lazy-loads and the single-thread ONNX path holds on
  the host without COOP/COEP headers.
- Minimal landing / usage note.
**Exit:** a public URL diagrams a typed sentence with no install; the repo is browsable with a
license.

## Phase 12 — Reproducibility / export animation *(deferred)*
**Goal:** deterministic + shareable *animation* (the original Phase 8 idea, now lower priority).
- Fixed-timestep `Clock`, seeded randomness → reproducible frames; offline render to video/GIF.
**Exit:** same input reproduces the same frames; an animation exports to a shareable file.

---

## Risk register
| Risk | Retired by | Status |
|------|-----------|--------|
| Footprint / non-overlap layout is the novel hard part | Phase 3 + collision oracle | ✅ retired |
| Portable spine + executor seam at the right altitude | Phase 2 | ✅ retired |
| Particle descriptions truly renderer-neutral | Phase 5 → Phase 7 | ✅ retired (GPU un-run) |
| Canvas2D perf ceiling justifies WebGPU | Phase 5 (quantified) | ✅ retired |
| Compound / subordinate-clause layout | Phase 4 | ✅ retired |
| Parse→R-K coverage on real constructions | Phase 6c + 90-sentence battery | ✅ retired (pedagogical scope) |
| WebGPU path runs in a real browser | Phase 7 verification | ⚠️ open (built, un-run) |
| Parse ambiguity surfaced, not guessed | Phase 9 | open |
| Coverage holds on non-pedagogical prose | Phase 10 | open |

## Open decisions
- **License** — pick before Phase 11 publish; lean permissive (MIT/Apache) per the
  reusable-building-block framing in RESEARCH.md.
- **Export scope** — SVG is committed (Phase 8); PNG/PDF and animation export (Phase 12) TBD.
- **Correction depth** — Phase 9: N-best selection is the floor; how far in-place IR editing
  goes (modifier re-attach vs. full node edit) is open.
- Parser: benepar chosen and shipped (int8 ONNX in-browser); Stanza constituency remains a
  fallback option if benepar coverage plateaus.
- Multilingual: English-only today; the IR is the convergence point for a future
  `dependency → IR` lowering (UD via Stanza/WASM). Not scheduled.

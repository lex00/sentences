# Roadmap

> Living document. Sequenced to hit the two riskiest unknowns early — the **footprint
> layout** and the **diff-and-tween + executor seam** — before investing in parser
> integration or GPU work. See `DESIGN.md` for the architecture and `RESEARCH.md` for the
> motivating gap.

## Status (2026-06-28)

- ✅ **Phase 0** Scaffold — Vite+TS, canvas, type contracts
- ✅ **Phase 1** IR + fixtures — superseded by layout(); IR fixtures remain
- ✅ **Phase 2** Animator + Canvas executor (RISK 1 retired)
- ✅ **Phase 3** Footprint layout engine (RISK 2 retired)
- ⏳ **Hardening** — Vitest landed early (Phase 8 testing pulled forward); 9 specs lock in the
  diff-and-tween and layout invariants. `npm test`.
- ▢ **Phase 4** next.

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

## Phase 8 — Reproducibility / export *(deferred decision)*
**Goal:** if wanted, deterministic + shareable output.
- Fixed-timestep `Clock`, seeded randomness → reproducible frames.
- Snapshot/regression tests on frames; offline render to video/GIF.
**Exit:** same input reproduces the same frames; an animation exports to a shareable file.

---

## Risk register
| Risk | Retired by | Status |
|------|-----------|--------|
| Footprint / non-overlap layout is the novel hard part | Phase 3 | open |
| Portable spine + executor seam at the right altitude | Phase 2 | open |
| Particle descriptions truly renderer-neutral | Phase 5 (params) → Phase 7 (confirmed) | open |
| Canvas2D perf ceiling justifies WebGPU | Phase 5 (quantify) | open |
| Compound / subordinate-clause layout | Phase 4 | open |
| Parse ambiguity (N-best) | Phase 6 | open |

## Open decisions (from DESIGN.md)
- Reproducibility/export model — deferred to Phase 8; `Clock` injectable so it's a swap.
- Parser: benepar vs Stanza constituency — lean benepar; revisit at Phase 6.
- Theme catalog / visual identities — explored in Phase 4.

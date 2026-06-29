# Reed-Kellogg Diagram Engine — Architecture

> Design captured 2026-06-28. Companion to `RESEARCH.md` (tool landscape + the parse→R-K gap).
> Target: an effects-rich, interactive Reed-Kellogg sentence-diagram renderer for the web.

## Why build at all

`RESEARCH.md` establishes the core finding: **no reliable, maintained tool auto-converts an
NLP parse into Reed-Kellogg notation.** Parsers stop at dependency/constituency trees; every
R-K renderer that looks good is manual. The bridge — parse → R-K geometry — plus a rich
graphical experience on top, is the product.

## Pipeline overview

```
constituency parse ─► IR ─► layout(metrics, layoutStyle) ─► Scene ─► Theme ─► Animator ─► Executor ─► pixels
   (reuse benepar)   (semantic)   (geometry, once)        (roles)  (look)   (motion)   (Canvas→WebGPU)
```

Lower the parse to an **R-K-specific IR** first; never lay out the parse tree directly. The
parse knows "NP → DT JJ NN"; the IR knows "this is the *subject*, a nominal with two
pre-modifiers." Different abstraction levels — conflating them is what makes ad-hoc renderers
collapse.

## Six orthogonal concerns

Each is swappable without touching the others. This separation is the whole architecture.

| Concern    | Lives in                                   | Portable across renderers? |
|------------|--------------------------------------------|----------------------------|
| Structure  | IR                                         | —                          |
| Position   | `layout()` → Scene                         | shared                     |
| Appearance | Theme (role → look)                        | shared                     |
| Motion     | Animator (diff + tween + clock + lifecycle)| **shared**                 |
| Execution  | EffectExecutor (Canvas now / WebGPU later) | **swappable — only per-renderer part** |
| Authoring  | EffectBindings (data)                      | shared                     |

Orthogonality table:

| Swap this… | …and it changes |
|------------|-----------------|
| IR         | the sentence    |
| layout     | where marks land|
| Theme      | the visual identity |
| Bindings   | which effects fire where |
| Executor   | Canvas vs WebGPU vs export |

---

## 1. IR — semantic layer

What *roles* exist, not where pixels go.

```typescript
type Clause = {
  subject:    Nominal
  verb:       Verbal
  complement: Complement | null      // DO, predicate noun/adj, or null (intransitive)
}

type Nominal = {
  head:       Word
  modifiers:  Modifier[]             // hang below the head
  appositive?: Word                  // drawn in parens on the baseline
}

type Verbal = {
  head:       Word                   // may be a verb phrase "has been running"
  modifiers:  Modifier[]
  indirectObject?: Nominal           // hangs below on a slant + rail
}

type Complement =
  | { kind: "directObject";  value: Nominal }   // divider: half-vertical, on baseline
  | { kind: "predicateNoun"; value: Nominal }   // divider: lean-left ╲
  | { kind: "predicateAdj";  value: Word    }   // divider: lean-left ╲

type Modifier =
  | { kind: "word"; value: Word }                        // adj/article/adverb/possessive → slant
  | { kind: "prep"; prep: Word; object: Nominal }        // slant carries prep, sub-rail carries object  ◄ recursion
  | { kind: "clause"; value: Clause; connector: Word }   // relative/subordinate, dotted connection      ◄ recursion

type Compound<T> = { items: T[]; conjunction: Word }     // fork structure, dotted conj line
```

Two recursion points (`prep.object`, `clause`) drive the recursion in layout.

---

## 2. Layout — measure / arrange with a 2-D footprint

R-K nodes consume space on **two interacting axes**: horizontal room on the baseline, AND a
diagonal footprint below/beside (hanging modifiers). Adjacent words' below-clusters can
collide independently of baseline spacing. This is why constituency-tree layout engines
(RSyntaxTree, Forest, tikz-qtree) do NOT transfer — they have no diagonal cross-sibling overhang.

`measure` (bottom-up) returns a footprint, not a width:

```typescript
type Footprint = {
  baselineWidth: number   // horizontal room the head needs ON the rail
  below: BBox             // bbox of everything hanging beneath, relative to the head's left anchor
}                         //   below = { left, right, depth }  — left/right can overhang the head
```

The **non-overlap rule** between baseline-adjacent heads i and i+1 — the crux of the whole engine:

```
gap = max(
   dividerGap,                       // notation minimum
   belowᵢ.right − belowᵢ₊₁.left      // keep hanging clusters from colliding
)
```

That second term is what no existing renderer gives you, and the riskiest/most novel code in
the system. Everything else is plumbing.

`arrange` (top-down): cumulative x along the rail, subject │ verb [half-vert / lean-left]
complement, applying the gap rule; recurse into PP sub-rails with origin = bottom of the slant.

**Slant geometry:** a modifier slant attaches under its head at angle θ; its length ∝ text
width (text rides the slant): extends `L·cosθ` right and `L·sinθ` down. PP = slant (carries
preposition) + a horizontal sub-rail (carries object, measured recursively).

**Critical constraint for animation:** `layout()` must assign Scene-node `id`s **structurally**
(from the IR node's path/role), NOT by iteration order. Stable ids → diff-and-tween can match
nodes across edits and morph them. Order-based ids → everything flickers and re-snaps.

---

## 3. Scene — the decoupling seam (tagged scene-graph)

With no TUI/grid target, every renderer is geometric, so the Scene is the single shared seam.
Run `layout()` once, fan the one Scene out to all renderers.

Two requirements for "rich":

**(a) A tagged scene-*graph*, not a flat list** — groups carry semantic role + stable id, so
hover-highlight / select / per-group animation come free in every renderer.

**(b) Primitives carry *roles*, not pixels.** A separate Theme maps role → appearance. Same
geometry, radically different looks (chalkboard / blueprint / minimal) by swapping one object.

```typescript
type Role =
  | "baseline" | "rail"
  | "divider.full" | "divider.half" | "divider.lean"
  | "slant" | "word" | "connector.dotted" | "fork"

type Prim =
  | { kind: "seg"; a: Pt; b: Pt; role: Role; sourceId?: IrId }
  | { kind: "lbl"; text: string; anchor: Pt; angle: number; role: Role; sourceId?: IrId }

type SceneNode = {
  id: NodeId                       // STABLE, structural
  role: "clause" | "subject" | "verb" | "object" | "modifier" | "pp" | ...
  sourceId?: IrId                  // back-ref to IR
  children: (SceneNode | Prim)[]
  bounds: BBox
}
type Scene = { root: SceneNode; bounds: BBox }
```

`metrics` (text measurement) is a single shared adapter (browser canvas `measureText` serves
SVG and GPU alike), injected into `layout()` — not a per-renderer port.

---

## 4. Theme — role → appearance

```typescript
interface Theme {
  stroke(role: Role): StrokeSpec               // weight, color, dash, line-cap
  font(role: Role): FontSpec
  emphasis(role: Role, state: "hover"|"active"|"muted"): Override
}
```

Split style strictly:
- `LayoutStyle` (θ, gaps, spacing) → feeds `layout()`, changes coordinates.
- `RenderStyle` / Theme (color, stroke, dash, font) → renderer-only, never touches layout.

If a renderer ever needs `LayoutStyle` to look right, the seam is wrong.

---

## 5. Motion — Animator (portable spine)

**Primary motion model: reactive diff-and-tween.** State change → new Scene → diff against
previous (keyed by stable id) → animate the delta.

```typescript
type Transition =
  | { kind: "enter";  node: SceneNode }                 // in next, not prev
  | { kind: "update"; from: SceneNode; to: SceneNode }  // in both, moved → tween (= morph & reflow, free)
  | { kind: "exit";   node: SceneNode }                 // in prev, not next

interface Clock { now(): number }   // INJECTABLE → determinism/export is a later swap, not a rewrite
```

`update` → geometry interpolation = morph & reflow, identical on any executor.
`enter` / `exit` → fire bindings (draw-on, particle burst, dissolve).

---

## 6. EffectBindings — "CSS for animation" (effects as data)

```typescript
type EffectBinding = {
  on:    "enter" | "update" | "exit" | "idle" | "hover" | "select"
  match: RoleSelector                       // role == "slant"  |  node.role == "subject"
  effect: EffectDesc
}

type EffectDesc =
  | { kind: "draw-on";   dur; easing }      // geometry reveal  ─┐ spine resolves into
  | { kind: "fade";      dur; easing }      //                   ├─ the tweened scene
  | { kind: "transform"; dur; easing }      //                  ─┘
  | { kind: "particles"; emitter: EmitterSpec }   // executor simulates (CPU on Canvas, GPU later)
  | { kind: "shader";    pass: ShaderPass }       // DEFERRED — see below
```

---

## 7. EffectExecutor — the only per-renderer part

```typescript
interface EffectExecutor {
  drawScene(scene: Scene, theme: Theme): void
  run(fx: EffectInstance, t: number): void
  supports(kind: EffectDesc["kind"]): boolean   // Canvas: false for "shader"
}
```

**Seam altitude:** the spine hands the executor effect *instances* (descriptor + target anchor
+ spawn time), NOT draw calls. Particle **simulation state lives inside the executor** — Canvas
keeps a CPU array, WebGPU keeps GPU buffers. This is the line between "portable spine" (chosen)
and "portable everything incl. sim model" (declined).

---

## Build plan: Canvas spike → WebGPU

**Decision:** start with a Canvas2D executor as a research spike to de-risk WebGPU.
**Decision:** portable spine + swappable executors — Canvas validates the real abstraction.
**Decision:** defer shaders/post-FX to the WebGPU phase.

### How effects transfer Canvas → WebGPU

| Effect class       | Transfers? | Notes |
|--------------------|------------|-------|
| Morph & reflow     | ✅ fully    | interpolating Scene deltas; the diff-and-tween spine drives both |
| Staged reveal      | ✅ mostly   | geometry interpolation (path draw-on, drop-in) |
| Particles & physics| ⚠️ params only | description/feel port; execution is CPU-loop vs GPU-compute |
| Shaders & post-FX  | ❌ barely   | Canvas can only fake glow/bloom/ink-bleed; learn "does it read", not "how to build" |

### Why "defer shaders" is clean, not a hack

The `shader` EffectDesc variant **stays in the model**. The Canvas executor reports
`supports("shader") === false` and no-ops it. A `shader` binding authored today lights up the
moment the WebGPU executor lands — zero change to bindings, Scene, or Animator. Deferral is a
capability flag, not a missing feature.

### Canvas spike's actual deliverable (the WebGPU de-risk checklist)

Not the pixels — the validated abstractions:

1. **Animator holds** — diff-and-tween stays legible with stable ids across real edits.
2. **Binding selectors are expressive enough** — can you say everything about which roles get which effects?
3. **Executor seam is at the right altitude** — instances, not draw calls; sim state executor-side.
4. **Particle descriptions are genuinely renderer-neutral** — params and feel port even though code won't.
5. **Quantified performance wall** — the particle/element count where Canvas2D falls over IS the
   written justification for WebGPU. Capture the number.

## Open decisions

- **Reproducibility/export** (deterministic frames vs live-only) — deferred, but the `Clock` is
  injectable so determinism is a swap, not a rewrite. Decide before video/GIF export work.
- **Parser choice** — benepar (constituency, R-K-shaped) vs Stanza constituency. R-K maps from
  constituency, not UD dependency arcs.
- **Compound / subordinate-clause layout** — fork structures and pedestal/stilt placement need
  their own measure/arrange cases beyond the core S-V-complement rail.

// "Build the diagram" — the drag-the-words mode, a thin app on the engine. The diagram's lines are
// drawn as a labeled skeleton (each word position is an empty slot showing the part it wants); the
// player drags a tray of shuffled words onto the right slots. describeAll() supplies the slots
// (position + correct word + role); a word sticks only in a slot whose word it matches. Model-free.

import { lowerSentence, layout, CanvasTextMetrics, describeAll, fitView, screenToScene, isNode, defaultTheme, defaultLayoutStyle } from "../engine.js";
import type { Scene, WordElement, Pt } from "../engine.js";
import { BANK } from "./bank.js";
import { record } from "./progress.js";
import "@fontsource/tinos";

const W = 780, H = 360;
const canvas = document.getElementById("stage") as HTMLCanvasElement;
const trayEl = document.getElementById("tray") as HTMLDivElement;
const feedbackEl = document.getElementById("feedback") as HTMLSpanElement;
const scoreEl = document.getElementById("score") as HTMLSpanElement;
const nextEl = document.getElementById("next") as HTMLButtonElement;

const hintsEl = document.getElementById("hints") as HTMLInputElement;
const metrics = new CanvasTextMetrics();
const ctx = canvas.getContext("2d")!;
const dpr = window.devicePixelRatio || 1;
let pulse: { cx: number; cy: number; start: number } | null = null; // correct-placement flourish
canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);

const randInt = (n: number) => Math.floor(Math.random() * n);
const shuffle = <T>(a: T[]): T[] => { for (let i = a.length - 1; i > 0; i--) { const j = randInt(i + 1); [a[i], a[j]] = [a[j]!, a[i]!]; } return a; };

type Slot = { el: WordElement; filled: boolean };
let bankIdx = randInt(BANK.length);
let scene: Scene;
let slots: Slot[] = [];
let remaining = 0;
let solvedTotal = 0;

const view = () => fitView(scene.bounds, W, H);

function setup(): void {
  const item = BANK[bankIdx++ % BANK.length]!;
  scene = layout(lowerSentence(item.ptb), metrics, defaultLayoutStyle);
  const words = describeAll(scene, metrics, defaultLayoutStyle.em).filter((e): e is WordElement => e.kind === "word");
  slots = words.map((el) => ({ el, filled: false }));
  remaining = slots.length;
  buildTray(shuffle(words.map((w) => w.text)));
  feedbackEl.textContent = ""; feedbackEl.className = "";
  nextEl.style.visibility = "hidden";
  draw();
}

function buildTray(texts: string[]): void {
  trayEl.textContent = "";
  for (const text of texts) {
    const chip = document.createElement("div");
    chip.className = "chip";
    chip.textContent = text;
    chip.dataset.word = text;
    attachDrag(chip);
    trayEl.append(chip);
  }
}

// --- rendering (in scene space; the view transform is applied to the context) ---

function applyView(): void {
  const v = view();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.translate(v.tx, v.ty);
  ctx.scale(v.s, v.s);
}

function draw(): void {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  applyView();
  // skeleton: every line, no words
  (function walk(n: Scene["root"]): void {
    for (const c of n.children) {
      if (isNode(c)) walk(c);
      else if (c.kind === "seg") {
        const st = defaultTheme.stroke(c.role);
        ctx.strokeStyle = st.color; ctx.lineWidth = st.weight; ctx.lineCap = st.cap ?? "butt";
        ctx.setLineDash(st.dash ?? []);
        ctx.beginPath(); ctx.moveTo(c.a.x, c.a.y); ctx.lineTo(c.b.x, c.b.y); ctx.stroke();
      }
    }
  })(scene.root);
  ctx.setLineDash([]);
  // slots: filled words drawn in place; empty slots as a dashed box + the role it wants
  for (const s of slots) {
    if (s.filled) {
      const f = defaultTheme.font("word");
      ctx.save();
      ctx.translate(s.el.anchor.x, s.el.anchor.y); ctx.rotate(s.el.angle);
      ctx.fillStyle = defaultTheme.stroke("word").color;
      ctx.font = `${f.size}px ${f.family}`; ctx.textBaseline = "alphabetic";
      ctx.fillText(s.el.text, 0, 0);
      ctx.restore();
    } else {
      const b = s.el.bbox;
      ctx.strokeStyle = "#c9a98f"; ctx.lineWidth = 1; ctx.setLineDash([4, 3]);
      ctx.strokeRect(b.left - 3, b.top - 2, b.right - b.left + 6, b.bottom - b.top + 4);
      ctx.setLineDash([]);
      if (hintsEl.checked) { // harder tier hides the role each slot wants
        ctx.fillStyle = "#b98a6e"; ctx.font = "9px ui-sans-serif, system-ui"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(s.el.role.toLowerCase(), (b.left + b.right) / 2, (b.top + b.bottom) / 2);
        ctx.textAlign = "start";
      }
    }
  }
  if (pulse) { // expanding, fading green ring where a word just landed correctly
    const t = (performance.now() - pulse.start) / 420;
    if (t >= 1) { pulse = null; }
    else {
      ctx.strokeStyle = "#2e7d32"; ctx.globalAlpha = 1 - t; ctx.lineWidth = 2;
      const r = 6 + t * 22;
      ctx.beginPath(); ctx.arc(pulse.cx, pulse.cy, r, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
}

function animatePulse(): void { if (pulse) { draw(); requestAnimationFrame(animatePulse); } }

// --- pointer coords -> scene ---

function toScene(clientX: number, clientY: number): Pt {
  const r = canvas.getBoundingClientRect();
  const p = { x: (clientX - r.left) * (W / r.width), y: (clientY - r.top) * (H / r.height) };
  return screenToScene(p, view());
}

function slotAt(p: Pt): Slot | null {
  let best: { d: number; s: Slot } | null = null;
  for (const s of slots) {
    if (s.filled) continue;
    const b = s.el.bbox;
    const pad = 8;
    if (p.x >= b.left - pad && p.x <= b.right + pad && p.y >= b.top - pad && p.y <= b.bottom + pad) {
      const cx = (b.left + b.right) / 2, cy = (b.top + b.bottom) / 2;
      const d = (p.x - cx) ** 2 + (p.y - cy) ** 2;
      if (!best || d < best.d) best = { d, s };
    }
  }
  return best?.s ?? null;
}

// --- drag a chip onto a slot ---

function attachDrag(chip: HTMLDivElement): void {
  let ghost: HTMLDivElement | null = null;
  const move = (e: PointerEvent) => { if (ghost) { ghost.style.left = `${e.clientX}px`; ghost.style.top = `${e.clientY}px`; } };
  chip.addEventListener("pointerdown", (e) => {
    if (chip.classList.contains("placed")) return;
    e.preventDefault();
    chip.setPointerCapture(e.pointerId);
    ghost = chip.cloneNode(true) as HTMLDivElement;
    ghost.style.cssText += "position:fixed;pointer-events:none;z-index:50;transform:translate(-50%,-50%);opacity:.92;box-shadow:0 3px 10px rgba(0,0,0,.2)";
    document.body.append(ghost);
    move(e);
  });
  chip.addEventListener("pointermove", move);
  chip.addEventListener("pointerup", (e) => {
    if (!ghost) return;
    ghost.remove(); ghost = null;
    const slot = slotAt(toScene(e.clientX, e.clientY));
    if (slot && slot.el.text === chip.dataset.word) {
      slot.filled = true;
      chip.classList.add("placed");
      remaining--;
      const b = slot.el.bbox;
      pulse = { cx: (b.left + b.right) / 2, cy: (b.top + b.bottom) / 2, start: performance.now() };
      requestAnimationFrame(animatePulse);
      if (remaining === 0) win(); else feedbackEl.textContent = "";
    } else if (slot) {
      flash(`that slot wants the ${slot.el.role.toLowerCase()}`, false);
      chip.classList.add("shake");
      chip.addEventListener("animationend", () => chip.classList.remove("shake"), { once: true });
    }
  });
}

function win(): void {
  solvedTotal++;
  record("build", true);
  flash("Solved!", true);
  nextEl.style.visibility = "visible";
  scoreEl.textContent = `${solvedTotal} solved`;
}

function flash(msg: string, good: boolean): void {
  feedbackEl.textContent = msg;
  feedbackEl.className = good ? "right" : "no";
}

nextEl.addEventListener("click", setup);
hintsEl.addEventListener("change", draw);
document.fonts.ready.then(setup);
void document.fonts.load(`${defaultLayoutStyle.em}px Tinos`);

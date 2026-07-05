// "Name that part" — a diagram is drawn, one part highlighted, the player picks what it is.
// Answer key is describeAll(). Three tiers: easy (core roles only), normal (all roles + lines),
// hard (also asks part of speech, using the POS now on word elements). Curated bank -> model-free.

import { lowerSentence, layout, CanvasTextMetrics, describeAll, posName, fitView, defaultTheme, defaultLayoutStyle } from "../engine.js";
import type { Scene, SceneElement } from "../engine.js";
import { CanvasExecutor } from "../canvas-renderer.js";
import { BANK } from "./bank.js";
import { record } from "./progress.js";
import "@fontsource/tinos";

const W = 760, H = 360;
const canvas = document.getElementById("stage") as HTMLCanvasElement;
const qEl = document.getElementById("q") as HTMLParagraphElement;
const choicesEl = document.getElementById("choices") as HTMLDivElement;
const feedbackEl = document.getElementById("feedback") as HTMLSpanElement;
const scoreEl = document.getElementById("score") as HTMLSpanElement;
const nextEl = document.getElementById("next") as HTMLButtonElement;
const sentEl = document.getElementById("sentence") as HTMLParagraphElement;
const showSentEl = document.getElementById("showsent") as HTMLInputElement;

const metrics = new CanvasTextMetrics();
const executor = new CanvasExecutor(canvas, W, H);
void document.fonts.load(`${defaultLayoutStyle.em}px Tinos`);

type Tier = "easy" | "normal" | "hard";
let tier: Tier = "normal";

const CORE_ROLES = new Set(["subject", "verb", "object"]);
const WORD_ROLES = new Set(["subject", "verb", "object", "complement", "modifier", "pp"]);
const LINE_ROLES = new Set(["divider.full", "divider.half", "divider.lean", "slant", "connector.dotted", "fork"]);
const WORD_VOCAB = ["Subject", "Verb", "Direct object", "Complement", "Modifier", "Prepositional phrase"];
const LINE_VOCAB = ["Subject | Predicate divider", "Verb | Object divider", "Complement divider", "Modifier line", "Connector", "Fork"];
const POS_VOCAB = ["noun", "proper noun", "adjective", "adverb", "verb", "pronoun", "article", "preposition", "conjunction", "number"];

const randInt = (n: number) => Math.floor(Math.random() * n);
const shuffle = <T>(a: T[]): T[] => { for (let i = a.length - 1; i > 0; i--) { const j = randInt(i + 1); [a[i], a[j]] = [a[j]!, a[i]!]; } return a; };
const pick = <T>(a: T[]) => a[randInt(a.length)]!;
const distinct = (a: string[]) => [...new Set(a)];

type Q = { scene: Scene; sentence: string; target: SceneElement; kind: "word" | "line"; prompt: string; answer: string; choices: string[] };
let bankIdx = randInt(BANK.length);
let q: Q | null = null;
let answered = false;
let score = 0, asked = 0, streak = 0;

function build(): Q {
  for (let tries = 0; tries < BANK.length * 2; tries++) {
    const item = BANK[bankIdx++ % BANK.length]!;
    const scene = layout(lowerSentence(item.ptb), metrics, defaultLayoutStyle);
    const els = describeAll(scene, metrics, defaultLayoutStyle.em);
    const words = els.filter((e) => e.kind === "word" && (tier === "easy" ? CORE_ROLES.has(e.roleKey) : WORD_ROLES.has(e.roleKey)));
    const lines = els.filter((e) => e.kind === "line" && LINE_ROLES.has(e.roleKey));

    // hard tier sometimes asks part of speech
    if (tier === "hard" && Math.random() < 0.45) {
      const taggable = els.filter((e): e is Extract<SceneElement, { kind: "word" }> => e.kind === "word" && !!posName(e.pos));
      if (taggable.length) {
        const target = pick(taggable);
        const answer = posName(target.pos)!;
        const inCtx = distinct(taggable.map((w) => posName(w.pos)!).filter((n) => n !== answer));
        const choices = shuffle([answer, ...shuffle([...inCtx, ...POS_VOCAB.filter((v) => !inCtx.includes(v) && v !== answer)]).slice(0, 3)]);
        return { scene, sentence: item.sentence, target, kind: "word", prompt: "What <b>part of speech</b> is the highlighted word?", answer, choices };
      }
    }

    const preferWord = words.length && (tier === "easy" || Math.random() < 0.6 || !lines.length);
    const poolEls = preferWord ? words : lines.length ? lines : words;
    if (!poolEls.length) continue;
    const target = pick(poolEls);
    const inCtx = distinct(els.filter((e) => e.kind === target.kind && e.role !== target.role).map((e) => e.role));
    const vocab = (target.kind === "word" ? WORD_VOCAB : LINE_VOCAB).filter((r) => r !== target.role);
    const choices = shuffle([target.role, ...shuffle([...inCtx, ...vocab.filter((v) => !inCtx.includes(v))]).slice(0, 3)]);
    return { scene, sentence: item.sentence, target, kind: target.kind, prompt: `What is the highlighted ${target.kind}?`, answer: target.role, choices };
  }
  throw new Error("no quizzable elements");
}

function drawHighlight(target: SceneElement, scene: Scene): void {
  const v = fitView(scene.bounds, W, H);
  const ctx = canvas.getContext("2d")!;
  const dpr = window.devicePixelRatio || 1;
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.strokeStyle = "#e06a1a"; ctx.fillStyle = "rgba(224,106,26,0.14)"; ctx.lineWidth = 2;
  if (target.kind === "word") {
    const b = target.bbox;
    ctx.beginPath();
    ctx.rect(b.left * v.s + v.tx - 4, b.top * v.s + v.ty - 3, (b.right - b.left) * v.s + 8, (b.bottom - b.top) * v.s + 6);
    ctx.fill(); ctx.stroke();
  } else {
    ctx.lineWidth = 7; ctx.lineCap = "round"; ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.moveTo(target.a.x * v.s + v.tx, target.a.y * v.s + v.ty);
    ctx.lineTo(target.b.x * v.s + v.tx, target.b.y * v.s + v.ty);
    ctx.stroke();
  }
  ctx.restore();
}

function render(): void {
  if (!q) return;
  executor.drawScene({ scene: q.scene, presence: new Map() }, defaultTheme);
  drawHighlight(q.target, q.scene);
  sentEl.textContent = showSentEl.checked ? q.sentence : "";
  qEl.innerHTML = q.prompt;
  choicesEl.textContent = "";
  for (const choice of q.choices) {
    const btn = document.createElement("button");
    btn.className = "choice"; btn.textContent = choice; btn.disabled = answered;
    btn.addEventListener("click", () => answer(choice, btn));
    choicesEl.append(btn);
  }
  updateScore();
}

function answer(choice: string, btn: HTMLButtonElement): void {
  if (answered || !q) return;
  answered = true; asked++;
  const correct = choice === q.answer;
  if (correct) { score++; streak++; } else { streak = 0; }
  record("identify", correct, streak);
  for (const b of Array.from(choicesEl.children) as HTMLButtonElement[]) {
    b.disabled = true;
    if (b.textContent === q.answer) b.classList.add("correct");
    else if (b === btn) b.classList.add("wrong");
  }
  feedbackEl.textContent = correct ? "Correct" : `It was the ${q.answer.toLowerCase()}`;
  feedbackEl.className = correct ? "right" : "no";
  feedbackEl.title = q.target.detail;
  nextEl.style.visibility = "visible";
  updateScore();
}

function updateScore(): void { scoreEl.textContent = `${score}/${asked}${streak > 1 ? `  ·  streak ${streak}` : ""}`; }

function advance(): void {
  q = build();
  answered = false;
  feedbackEl.textContent = ""; feedbackEl.className = "";
  nextEl.style.visibility = "hidden";
  render();
}

nextEl.addEventListener("click", advance);
showSentEl.addEventListener("change", () => { if (q) sentEl.textContent = showSentEl.checked ? q.sentence : ""; });
for (const btn of Array.from(document.querySelectorAll<HTMLButtonElement>(".tier"))) {
  btn.addEventListener("click", () => {
    tier = btn.dataset.tier as Tier;
    for (const b of Array.from(document.querySelectorAll(".tier"))) b.classList.toggle("on", b === btn);
    if (tier === "easy") { showSentEl.checked = true; } // easy shows the sentence by default
    advance();
  });
}
document.fonts.ready.then(advance);

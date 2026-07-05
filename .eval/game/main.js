// "Name that part" — the first game mode, a thin app on the engine. A diagram is drawn, one part
// is highlighted, and the player picks its grammatical role. The answer key is describeAll(); the
// diagrams are a curated, pre-verified bank, so this mode needs no model at runtime.
import { lowerSentence, layout, CanvasTextMetrics, describeAll, fitView, defaultTheme, defaultLayoutStyle } from "../engine.js";
import { CanvasExecutor } from "../canvas-renderer.js";
import { BANK } from "./bank.js";
import "@fontsource/tinos";
const W = 760, H = 360;
const canvas = document.getElementById("stage");
const qEl = document.getElementById("q");
const choicesEl = document.getElementById("choices");
const feedbackEl = document.getElementById("feedback");
const scoreEl = document.getElementById("score");
const nextEl = document.getElementById("next");
const metrics = new CanvasTextMetrics();
const executor = new CanvasExecutor(canvas, W, H);
void document.fonts.load(`${defaultLayoutStyle.em}px Tinos`);
// Roles worth quizzing (skip the generic baseline/rail and bare articles feel fine to include).
const WORD_ROLES = new Set(["subject", "verb", "object", "complement", "modifier", "pp"]);
const LINE_ROLES = new Set(["divider.full", "divider.half", "divider.lean", "slant", "connector.dotted", "fork"]);
// Fallback distractor pools (display names), used when one diagram lacks enough variety.
const WORD_VOCAB = ["Subject", "Verb", "Direct object", "Complement", "Modifier", "Prepositional phrase"];
const LINE_VOCAB = ["Subject | Predicate divider", "Verb | Object divider", "Complement divider", "Modifier line", "Connector", "Fork"];
const randInt = (n) => Math.floor(Math.random() * n);
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
} return a; };
const pick = (a) => a[randInt(a.length)];
let bankIdx = randInt(BANK.length);
let q = null;
let answered = false;
let score = 0, asked = 0, streak = 0;
function newQuestion() {
    // find a diagram that has at least one quizzable element (all do, but be safe)
    for (let tries = 0; tries < BANK.length; tries++) {
        const item = BANK[bankIdx % BANK.length];
        bankIdx++;
        const scene = layout(lowerSentence(item.ptb), metrics, defaultLayoutStyle);
        const els = describeAll(scene, metrics, defaultLayoutStyle.em);
        const words = els.filter((e) => e.kind === "word" && WORD_ROLES.has(e.roleKey));
        const lines = els.filter((e) => e.kind === "line" && LINE_ROLES.has(e.roleKey));
        const preferWord = words.length && (Math.random() < 0.6 || !lines.length);
        const poolEls = preferWord ? words : lines.length ? lines : words;
        if (!poolEls.length)
            continue;
        const target = pick(poolEls);
        // Distractors: other roles present in THIS diagram (same kind), padded from the vocab.
        const inContext = [...new Set(els.filter((e) => e.kind === target.kind && e.role !== target.role).map((e) => e.role))];
        const vocab = (target.kind === "word" ? WORD_VOCAB : LINE_VOCAB).filter((r) => r !== target.role);
        const distractors = shuffle([...inContext, ...vocab.filter((v) => !inContext.includes(v))]).slice(0, 3);
        const choices = shuffle([target.role, ...distractors]);
        return { scene, target, choices };
    }
    throw new Error("no quizzable elements in the bank");
}
function drawHighlight(target, scene) {
    const v = fitView(scene.bounds, W, H);
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // draw in CSS px, matching the executor's fit()
    ctx.strokeStyle = "#e06a1a";
    ctx.fillStyle = "rgba(224,106,26,0.14)";
    ctx.lineWidth = 2;
    if (target.kind === "word") {
        const b = target.bbox;
        const x = b.left * v.s + v.tx - 4, y = b.top * v.s + v.ty - 3;
        const w = (b.right - b.left) * v.s + 8, h = (b.bottom - b.top) * v.s + 6;
        ctx.beginPath();
        ctx.rect(x, y, w, h);
        ctx.fill();
        ctx.stroke();
    }
    else {
        ctx.lineWidth = 7;
        ctx.lineCap = "round";
        ctx.globalAlpha = 0.5;
        ctx.beginPath();
        ctx.moveTo(target.a.x * v.s + v.tx, target.a.y * v.s + v.ty);
        ctx.lineTo(target.b.x * v.s + v.tx, target.b.y * v.s + v.ty);
        ctx.stroke();
    }
    ctx.restore();
}
function render() {
    if (!q)
        return;
    executor.drawScene({ scene: q.scene, presence: new Map() }, defaultTheme);
    drawHighlight(q.target, q.scene);
    qEl.innerHTML = `What is the <b>highlighted ${q.target.kind}</b>?`;
    choicesEl.textContent = "";
    for (const choice of q.choices) {
        const btn = document.createElement("button");
        btn.className = "choice";
        btn.textContent = choice;
        btn.disabled = answered;
        btn.addEventListener("click", () => answer(choice, btn));
        choicesEl.append(btn);
    }
    updateScore();
}
function answer(choice, btn) {
    if (answered || !q)
        return;
    answered = true;
    asked++;
    const correct = choice === q.target.role;
    if (correct) {
        score++;
        streak++;
    }
    else {
        streak = 0;
    }
    for (const b of Array.from(choicesEl.children)) {
        b.disabled = true;
        if (b.textContent === q.target.role)
            b.classList.add("correct");
        else if (b === btn)
            b.classList.add("wrong");
    }
    feedbackEl.textContent = correct ? "Correct" : `It was the ${q.target.role.toLowerCase()}`;
    feedbackEl.className = correct ? "right" : "no";
    feedbackEl.title = q.target.detail;
    nextEl.style.visibility = "visible";
    updateScore();
}
function updateScore() {
    scoreEl.textContent = `${score}/${asked}${streak > 1 ? `  ·  streak ${streak}` : ""}`;
}
function advance() {
    q = newQuestion();
    answered = false;
    feedbackEl.textContent = "";
    feedbackEl.className = "";
    nextEl.style.visibility = "hidden";
    render();
}
nextEl.addEventListener("click", advance);
// wait for the pinned font so word boxes are measured correctly, then start
document.fonts.ready.then(advance);

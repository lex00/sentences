// "Build the diagram" — the drag-the-words mode, a thin app on the engine. The diagram's lines are
// drawn as a labeled skeleton (each word position is an empty slot showing the part it wants); the
// player drags a tray of shuffled words onto the right slots. describeAll() supplies the slots
// (position + correct word + role); a word sticks only in a slot whose word it matches. Model-free.
import { lowerSentence, layout, CanvasTextMetrics, describeAll, fitView, screenToScene, isNode, defaultTheme, defaultLayoutStyle } from "../engine.js";
import { BANK } from "./bank.js";
import "@fontsource/tinos";
const W = 780, H = 360;
const canvas = document.getElementById("stage");
const trayEl = document.getElementById("tray");
const feedbackEl = document.getElementById("feedback");
const scoreEl = document.getElementById("score");
const nextEl = document.getElementById("next");
const metrics = new CanvasTextMetrics();
const ctx = canvas.getContext("2d");
const dpr = window.devicePixelRatio || 1;
canvas.style.width = `${W}px`;
canvas.style.height = `${H}px`;
canvas.width = Math.round(W * dpr);
canvas.height = Math.round(H * dpr);
const randInt = (n) => Math.floor(Math.random() * n);
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
} return a; };
let bankIdx = randInt(BANK.length);
let scene;
let slots = [];
let remaining = 0;
let solvedTotal = 0;
const view = () => fitView(scene.bounds, W, H);
function setup() {
    const item = BANK[bankIdx++ % BANK.length];
    scene = layout(lowerSentence(item.ptb), metrics, defaultLayoutStyle);
    const words = describeAll(scene, metrics, defaultLayoutStyle.em).filter((e) => e.kind === "word");
    slots = words.map((el) => ({ el, filled: false }));
    remaining = slots.length;
    buildTray(shuffle(words.map((w) => w.text)));
    feedbackEl.textContent = "";
    feedbackEl.className = "";
    nextEl.style.visibility = "hidden";
    draw();
}
function buildTray(texts) {
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
function applyView() {
    const v = view();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.translate(v.tx, v.ty);
    ctx.scale(v.s, v.s);
}
function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    applyView();
    // skeleton: every line, no words
    (function walk(n) {
        for (const c of n.children) {
            if (isNode(c))
                walk(c);
            else if (c.kind === "seg") {
                const st = defaultTheme.stroke(c.role);
                ctx.strokeStyle = st.color;
                ctx.lineWidth = st.weight;
                ctx.lineCap = st.cap ?? "butt";
                ctx.setLineDash(st.dash ?? []);
                ctx.beginPath();
                ctx.moveTo(c.a.x, c.a.y);
                ctx.lineTo(c.b.x, c.b.y);
                ctx.stroke();
            }
        }
    })(scene.root);
    ctx.setLineDash([]);
    // slots: filled words drawn in place; empty slots as a dashed box + the role it wants
    for (const s of slots) {
        if (s.filled) {
            const f = defaultTheme.font("word");
            ctx.save();
            ctx.translate(s.el.anchor.x, s.el.anchor.y);
            ctx.rotate(s.el.angle);
            ctx.fillStyle = defaultTheme.stroke("word").color;
            ctx.font = `${f.size}px ${f.family}`;
            ctx.textBaseline = "alphabetic";
            ctx.fillText(s.el.text, 0, 0);
            ctx.restore();
        }
        else {
            const b = s.el.bbox;
            ctx.strokeStyle = "#c9a98f";
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 3]);
            ctx.strokeRect(b.left - 3, b.top - 2, b.right - b.left + 6, b.bottom - b.top + 4);
            ctx.setLineDash([]);
            ctx.fillStyle = "#b98a6e";
            ctx.font = "9px ui-sans-serif, system-ui";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(s.el.role.toLowerCase(), (b.left + b.right) / 2, (b.top + b.bottom) / 2);
            ctx.textAlign = "start";
        }
    }
}
// --- pointer coords -> scene ---
function toScene(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    const p = { x: (clientX - r.left) * (W / r.width), y: (clientY - r.top) * (H / r.height) };
    return screenToScene(p, view());
}
function slotAt(p) {
    let best = null;
    for (const s of slots) {
        if (s.filled)
            continue;
        const b = s.el.bbox;
        const pad = 8;
        if (p.x >= b.left - pad && p.x <= b.right + pad && p.y >= b.top - pad && p.y <= b.bottom + pad) {
            const cx = (b.left + b.right) / 2, cy = (b.top + b.bottom) / 2;
            const d = (p.x - cx) ** 2 + (p.y - cy) ** 2;
            if (!best || d < best.d)
                best = { d, s };
        }
    }
    return best?.s ?? null;
}
// --- drag a chip onto a slot ---
function attachDrag(chip) {
    let ghost = null;
    const move = (e) => { if (ghost) {
        ghost.style.left = `${e.clientX}px`;
        ghost.style.top = `${e.clientY}px`;
    } };
    chip.addEventListener("pointerdown", (e) => {
        if (chip.classList.contains("placed"))
            return;
        e.preventDefault();
        chip.setPointerCapture(e.pointerId);
        ghost = chip.cloneNode(true);
        ghost.style.cssText += "position:fixed;pointer-events:none;z-index:50;transform:translate(-50%,-50%);opacity:.92;box-shadow:0 3px 10px rgba(0,0,0,.2)";
        document.body.append(ghost);
        move(e);
    });
    chip.addEventListener("pointermove", move);
    chip.addEventListener("pointerup", (e) => {
        if (!ghost)
            return;
        ghost.remove();
        ghost = null;
        const slot = slotAt(toScene(e.clientX, e.clientY));
        if (slot && slot.el.text === chip.dataset.word) {
            slot.filled = true;
            chip.classList.add("placed");
            remaining--;
            draw();
            if (remaining === 0)
                win();
        }
        else if (slot) {
            flash(`that slot wants the ${slot.el.role.toLowerCase()}`, false);
        }
    });
}
function win() {
    solvedTotal++;
    flash("Solved!", true);
    nextEl.style.visibility = "visible";
    scoreEl.textContent = `${solvedTotal} solved`;
}
function flash(msg, good) {
    feedbackEl.textContent = msg;
    feedbackEl.className = good ? "right" : "no";
}
nextEl.addEventListener("click", setup);
document.fonts.ready.then(setup);
void document.fonts.load(`${defaultLayoutStyle.em}px Tinos`);

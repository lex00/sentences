// "Write to the challenge" — the free-write mode, the one that generates instead of identifies.
// A goal is posed ("write a sentence with a direct object"); the player writes; the sentence is
// parsed by the NEURAL parser (analyze), diagrammed, and checked against the goal from its roles.
// First version: function-level criteria (direct object, PP, complement, subordinate clause,
// compound, modifier count) — readable straight off the role elements, no POS needed yet.

import { analyze, posTags, ModelParser, CanvasTextMetrics, defaultTheme, defaultLayoutStyle } from "../engine.js";
import type { SceneElement, Analysis } from "../engine.js";
import { CanvasExecutor } from "../canvas-renderer.js";
import "@fontsource/tinos";

const W = 780, H = 340;
const canvas = document.getElementById("stage") as HTMLCanvasElement;
const input = document.getElementById("sentence") as HTMLInputElement;
const checkBtn = document.getElementById("check") as HTMLButtonElement;
const challengeEl = document.getElementById("challenge") as HTMLParagraphElement;
const hintEl = document.getElementById("hint") as HTMLParagraphElement;
const verdictEl = document.getElementById("verdict") as HTMLParagraphElement;
const statusEl = document.getElementById("status") as HTMLParagraphElement;
const nextEl = document.getElementById("next") as HTMLButtonElement;

const metrics = new CanvasTextMetrics();
const executor = new CanvasExecutor(canvas, W, H);

const wordsOf = (els: SceneElement[]) => els.filter((e): e is Extract<SceneElement, { kind: "word" }> => e.kind === "word");
// count words whose POS tag starts with any prefix (JJ -> JJ/JJR/JJS, etc.)
const countTag = (a: Analysis, prefixes: string[]) => posTags(a.tree).filter((t) => prefixes.some((p) => t.tag.startsWith(p))).length;

type Challenge = { prompt: string; hint: string; ok: (a: Analysis) => boolean };
const CHALLENGES: Challenge[] = [
  {
    prompt: "Write a sentence with a <b>direct object</b>.",
    hint: "the noun that receives the action — “the dog chased the ball”",
    // a direct object is an "object" NOT sitting inside a prepositional phrase
    ok: (a) => wordsOf(a.elements).some((w) => w.roleKey === "object" && !w.roles.includes("pp")),
  },
  {
    prompt: "Write a sentence with a <b>prepositional phrase</b>.",
    hint: "“in the house”, “on the table”, “with a friend”",
    ok: (a) => wordsOf(a.elements).some((w) => w.roleKey === "pp"),
  },
  {
    prompt: "Write a sentence with a <b>predicate adjective or noun</b>.",
    hint: "use a linking verb — “the sky is blue”, “she is a doctor”",
    ok: (a) => wordsOf(a.elements).some((w) => w.roleKey === "complement"),
  },
  {
    prompt: "Write a sentence with a <b>subordinate clause</b>.",
    hint: "starts with because, that, who, when… — “I left because it rained”",
    ok: (a) => a.elements.some((e) => e.roles.includes("subclause")),
  },
  {
    prompt: "Write a <b>compound</b> (join with “and” or “or”).",
    hint: "compound subject or predicate — “dogs and cats”, “ran and jumped”",
    ok: (a) => a.elements.some((e) => e.kind === "line" && e.roleKey === "fork"),
  },
  // --- part-of-speech (from the parse tags) ---
  {
    prompt: "Write a sentence with <b>two adjectives</b>.",
    hint: "describing words — “a tall, dark stranger”",
    ok: (a) => countTag(a, ["JJ"]) >= 2,
  },
  {
    prompt: "Write a sentence with an <b>adverb</b>.",
    hint: "how/when/where — often ends in -ly — “she sang loudly”",
    ok: (a) => countTag(a, ["RB"]) >= 1,
  },
  {
    prompt: "Write a sentence with a <b>proper noun</b>.",
    hint: "a name, capitalized — “Maria”, “Paris”",
    ok: (a) => countTag(a, ["NNP"]) >= 1,
  },
  {
    prompt: "Write a sentence in the <b>past tense</b>.",
    hint: "a past-tense verb — “walked”, “ran”, “was”",
    ok: (a) => countTag(a, ["VBD"]) >= 1,
  },
  {
    prompt: "Write a sentence with a <b>plural noun</b>.",
    hint: "more than one — “dogs”, “children”",
    ok: (a) => countTag(a, ["NNS", "NNPS"]) >= 1,
  },
];

let challenge: Challenge;
let solved = 0;

// The neural parser loads once (same-origin model; this mode needs it).
let model: ModelParser | null = null;
let modelState: "idle" | "loading" | "ready" | "failed" = "idle";
function ensureModel(): void {
  if (modelState !== "idle") return;
  modelState = "loading";
  statusEl.textContent = "loading the parser (~72 MB, first time)…";
  ModelParser.load(`${import.meta.env.BASE_URL}models`)
    .then((m) => { model = m; modelState = "ready"; statusEl.textContent = "ready — write your sentence"; })
    .catch((err) => { modelState = "failed"; console.error("[model load failed]", err); statusEl.textContent = "parser failed to load (see console)"; });
}

function newChallenge(): void {
  challenge = CHALLENGES[Math.floor(Math.random() * CHALLENGES.length)]!;
  challengeEl.innerHTML = challenge.prompt;
  hintEl.textContent = challenge.hint;
  verdictEl.textContent = ""; verdictEl.className = "";
  canvas.style.display = "none";
  nextEl.style.visibility = "hidden";
  input.value = ""; input.focus();
}

async function check(): Promise<void> {
  const text = input.value.trim();
  if (!text) return;
  if (!model) { ensureModel(); statusEl.textContent = modelState === "loading" ? "still loading the parser — try again in a moment" : statusEl.textContent; return; }
  statusEl.textContent = "parsing…";
  try {
    const a = await analyze(model, text, metrics);
    executor.drawScene({ scene: a.scene, presence: new Map() }, defaultTheme);
    canvas.style.display = "";
    const pass = challenge.ok(a);
    statusEl.textContent = "";
    verdictEl.textContent = pass ? "✓ Yes — that fits the challenge!" : "✗ Not yet — the diagram doesn’t show it. Try again.";
    verdictEl.className = pass ? "right" : "no";
    if (pass) { solved++; nextEl.style.visibility = "visible"; }
  } catch (err) {
    console.error("[parse failed]", err);
    statusEl.textContent = "couldn’t parse that one — try rephrasing";
  }
}

input.addEventListener("focus", ensureModel);
input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); void check(); } });
checkBtn.addEventListener("click", () => void check());
nextEl.addEventListener("click", newChallenge);

void document.fonts.load(`${defaultLayoutStyle.em}px Tinos`);
newChallenge();
ensureModel();

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

// A reusable condition. `feature` is a short noun phrase used as the goal, in the per-part results
// of a composed challenge, and, on a single miss, to tell the player what their sentence DID have.
type Condition = { feature: string; hint: string; ok: (a: Analysis) => boolean };
const CONDITIONS: Condition[] = [
  // --- function-level (from the diagram's roles) ---
  { feature: "a direct object", hint: "the noun that receives the action — “the dog chased the ball”",
    ok: (a) => wordsOf(a.elements).some((w) => w.roleKey === "object" && !w.roles.includes("pp")) },
  { feature: "a prepositional phrase", hint: "“in the house”, “on the table”, “with a friend”",
    ok: (a) => wordsOf(a.elements).some((w) => w.roleKey === "pp") },
  { feature: "a predicate adjective or noun", hint: "use a linking verb — “the sky is blue”, “she is a doctor”",
    ok: (a) => wordsOf(a.elements).some((w) => w.roleKey === "complement") },
  { feature: "a subordinate clause", hint: "starts with because, that, who, when… — “I left because it rained”",
    ok: (a) => a.elements.some((e) => e.roles.includes("subclause")) },
  { feature: "a compound", hint: "join with “and” or “or” — “dogs and cats”, “ran and jumped”",
    ok: (a) => a.elements.some((e) => e.kind === "line" && e.roleKey === "fork") },
  // --- part-of-speech (from the parse tags) ---
  { feature: "two adjectives", hint: "describing words — “a tall, dark stranger”", ok: (a) => countTag(a, ["JJ"]) >= 2 },
  { feature: "an adverb", hint: "how/when/where — often ends in -ly — “she sang loudly”", ok: (a) => countTag(a, ["RB"]) >= 1 },
  { feature: "a proper noun", hint: "a name, capitalized — “Maria”, “Paris”", ok: (a) => countTag(a, ["NNP"]) >= 1 },
  { feature: "a past-tense verb", hint: "“walked”, “ran”, “was”", ok: (a) => countTag(a, ["VBD"]) >= 1 },
  { feature: "a plural noun", hint: "more than one — “dogs”, “children”", ok: (a) => countTag(a, ["NNS", "NNPS"]) >= 1 },
  { feature: "a comparative", hint: "bigger, faster, more careful — “the bigger dog won”", ok: (a) => countTag(a, ["JJR", "RBR"]) >= 1 },
  { feature: "a superlative", hint: "biggest, fastest, most careful — “the fastest runner”", ok: (a) => countTag(a, ["JJS", "RBS"]) >= 1 },
  { feature: "a pronoun", hint: "he, she, it, they, we — “they found it”", ok: (a) => countTag(a, ["PRP"]) >= 1 },
  { feature: "a number", hint: "a counting word — “three cats”, “ten miles”", ok: (a) => countTag(a, ["CD"]) >= 1 },
  { feature: "at least eight words", hint: "a longer sentence", ok: (a) => posTags(a.tree).filter((t) => /^[A-Za-z]/.test(t.tag)).length >= 8 },
];

// A challenge is one or more conditions that must all hold. Composed ones combine conditions and
// report each part's pass/fail, so a near-miss is legible ("✓ compound · ✗ past-tense verb").
type Challenge = { prompt: string; hint: string; parts: Condition[] };
const cond = (feature: string): Condition => CONDITIONS.find((c) => c.feature === feature)!;
const single = (c: Condition): Challenge => ({ prompt: `Write a sentence with <b>${c.feature}</b>.`, hint: c.hint, parts: [c] });
const composed = (cs: Condition[]): Challenge => ({
  prompt: `Write a sentence with <b>${cs.map((c) => c.feature).join("</b> and <b>")}</b>.`,
  hint: cs.map((c) => c.hint).join("  ·  "),
  parts: cs,
});
const COMPOSED: Challenge[] = [
  composed([cond("a compound"), cond("a past-tense verb")]),
  composed([cond("a direct object"), cond("a prepositional phrase")]),
  composed([cond("two adjectives"), cond("an adverb")]),
  composed([cond("a subordinate clause"), cond("a proper noun")]),
  composed([cond("a direct object"), cond("a comparative")]),
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

const pick = <T>(a: T[]): T => a[Math.floor(Math.random() * a.length)]!;

function newChallenge(): void {
  challenge = Math.random() < 0.35 ? pick(COMPOSED) : single(pick(CONDITIONS));
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
    const results = challenge.parts.map((p) => ({ feature: p.feature, ok: p.ok(a) }));
    const pass = results.every((r) => r.ok);
    statusEl.textContent = "";
    if (pass) {
      verdictEl.textContent = "✓ Yes — that fits the challenge!";
      solved++; nextEl.style.visibility = "visible";
    } else if (challenge.parts.length > 1) {
      // composed: show which parts are met
      verdictEl.textContent = `✗ Not yet — ${results.map((r) => `${r.ok ? "✓" : "✗"} ${r.feature}`).join("  ·  ")}. Try again.`;
    } else {
      // single: name what the sentence DOES have, to teach
      const found = CONDITIONS.filter((c) => c.feature !== challenge.parts[0]!.feature && c.ok(a)).map((c) => c.feature);
      const also = found.length ? ` But it does have ${found.slice(0, 2).join(" and ")}.` : "";
      verdictEl.textContent = `✗ Not yet — no ${challenge.parts[0]!.feature} in the diagram.${also} Try again.`;
    }
    verdictEl.className = pass ? "right" : "no";
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

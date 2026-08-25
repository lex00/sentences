// destink.html — the user-facing app: paste prose, get located findings, a stink score, and
// (today) demo-fixer mechanical fixes. A thin app on the lint engine, same shape as the game
// modes (src/game/free.ts): DOM wiring here, all the actual analysis lives in src/lint/**.
//
// Two passes, same as the issue asks for:
//   FAST   buildDocAnalysis(text) -> runRules(enabledRules) -> buildReport. Synchronous, no
//          download, runs the moment the reader clicks Lint.
//   NEURAL analyzeDocument(model, text) -> runRules(...) -> buildReport, once the model (lazily
//          loaded on focus, exactly free.ts's pattern) has arrived. Re-lints in place: same
//          rules, richer DocAnalysis (real POS tags/tree per unit), so syntactic-tier rules that
//          need them get another, more accurate pass over the same text.
//
// The model is NOT fetched on page load — only on focusing the textarea or clicking Lint — so
// pasting and linting a paragraph produces a score with nothing downloaded, per the issue's
// acceptance criterion. It refines in place when the model arrives.

import { ModelParser, CanvasTextMetrics, defaultTheme, defaultLayoutStyle } from "../engine.js";
import { buildDocAnalysis } from "../lint/build-doc.js";
import { analyzeDocument } from "../lint/analyze-document.js";
import { runRules } from "../lint/engine.js";
import { buildReport } from "../lint/report.js";
import type { ReportFinding } from "../lint/report.js";
import { RULES, enabledRules } from "../lint/registry.js";
import type { RuleToggles } from "../lint/registry.js";
import type { DocAnalysis, TropeRule } from "../lint/types.js";
import { fixLoop, defaultProvider } from "../lint/fix/index.js";
import type { FixLoopResult } from "../lint/fix/index.js";
import { loadToggles, saveToggles } from "./toggles.js";
import { computeFixDiff } from "./diff.js";
import { renderScore, renderToggles, renderAnnotatedText, renderFindingsList, renderFixDiff, flashFinding, strategyLabel } from "./ui.js";
import { renderFindingDiagram } from "./diagram-finding.js";
import { findingKey, openIndices } from "./diagram-panels.js";
import "@fontsource/tinos";

const textareaEl = document.getElementById("input") as HTMLTextAreaElement;
const lintBtn = document.getElementById("lintBtn") as HTMLButtonElement;
const fixBtn = document.getElementById("fixBtn") as HTMLButtonElement;
const acceptBtn = document.getElementById("acceptFix") as HTMLButtonElement;
const discardBtn = document.getElementById("discardFix") as HTMLButtonElement;
const statusEl = document.getElementById("status") as HTMLParagraphElement;
const scoreEl = document.getElementById("score") as HTMLDivElement;
const togglesEl = document.getElementById("toggles") as HTMLDivElement;
const annotatedEl = document.getElementById("annotated") as HTMLDivElement;
const findingsEl = document.getElementById("findings") as HTMLDivElement;
const fixPanelEl = document.getElementById("fixPanel") as HTMLDivElement;
const fixDiffEl = document.getElementById("fixDiff") as HTMLDivElement;

let toggles: RuleToggles = loadToggles(window.localStorage);
let currentText = "";
let currentDoc: DocAnalysis | null = null;
let currentFindings: readonly ReportFinding[] = [];
let lastFix: { result: FixLoopResult; original: string } | null = null;

const rulesFor = (): TropeRule[] => enabledRules(toggles, RULES);

// ---------------------------------------------------------------------------------------------
// Rendering a DocAnalysis (from either pass) into the score / highlights / findings panels
// ---------------------------------------------------------------------------------------------

function renderAll(doc: DocAnalysis, text: string): void {
  const rules = rulesFor();
  const { findings, errors } = runRules(rules, doc);
  const report = buildReport(text, findings, errors, rules);
  currentDoc = doc;
  currentFindings = report.findings;
  renderScore(scoreEl, report);
  renderAnnotatedText(annotatedEl, text, report.findings);
  // Which panels were open before this re-lint, found by stable finding key (ruleId + span) since
  // toggling a rule or the neural pass arriving can reorder, add, or remove findings — see
  // diagram-panels.ts. renderFindingsList draws those panels immediately, no extra click needed.
  const reopen = new Set(openIndices(report.findings, openDiagramKeys));
  renderFindingsList(
    findingsEl,
    report.findings,
    (idx) => flashFinding(annotatedEl, idx),
    { isOpen: (idx) => reopen.has(idx), onToggle: showFindingDiagram },
  );
  if (errors.length) console.warn("[destink] rule error(s):", errors);
}

function runFastPass(text: string): void {
  renderAll(buildDocAnalysis(text), text);
}

async function runNeuralPass(text: string): Promise<void> {
  if (!model) return;
  statusEl.textContent = "refining with the neural parser…";
  try {
    const doc = await analyzeDocument(model, text);
    if (text !== currentText) return; // superseded by a newer Lint click; drop this result
    renderAll(doc, text);
    statusEl.textContent = "neural parser ready — findings refined";
  } catch (err) {
    console.error("[destink] neural pass failed:", err);
    if (text === currentText) statusEl.textContent = "neural pass failed — showing rule-based results only (see console)";
  }
}

function lint(): void {
  const text = textareaEl.value;
  currentText = text;
  fixPanelEl.hidden = true;
  lastFix = null;
  runFastPass(text);
  if (modelState === "ready") {
    void runNeuralPass(text);
  } else if (modelState === "loading") {
    statusEl.textContent = "loading the neural parser (~72 MB, first time)…";
  } else {
    ensureModel();
  }
}

// ---------------------------------------------------------------------------------------------
// The neural parser: lazy-loaded on focus, exactly free.ts's pattern (same URL, same status
// copy, same idle/loading/ready/failed states) — see src/game/free.ts's ensureModel.
// ---------------------------------------------------------------------------------------------

let model: ModelParser | null = null;
let modelState: "idle" | "loading" | "ready" | "failed" = "idle";

function ensureModel(): void {
  if (modelState !== "idle") return;
  modelState = "loading";
  statusEl.textContent = "loading the neural parser (~72 MB, first time)…";
  ModelParser.load(`${import.meta.env.BASE_URL}models`)
    .then((m) => {
      model = m;
      modelState = "ready";
      statusEl.textContent = "neural parser ready";
      if (currentText) void runNeuralPass(currentText);
    })
    .catch((err) => {
      modelState = "failed";
      console.error("[destink] model load failed:", err);
      statusEl.textContent = "neural parser unavailable — showing rule-based results only (see console)";
    });
}

// ---------------------------------------------------------------------------------------------
// Diagram-the-finding (#26): click "show me" on a finding, get its sentence diagrammed with the
// offending marks lit up. One CanvasTextMetrics for the whole page's lifetime (layout only reads
// it, never mutates it — free.ts and the game modes do the same). openDiagramKeys tracks which
// panels are open by stable finding key (diagram-panels.ts) so a re-lint can redraw them instead
// of silently closing them.
// ---------------------------------------------------------------------------------------------

const metrics = new CanvasTextMetrics();
void document.fonts.load(`${defaultLayoutStyle.em}px Tinos`);
const openDiagramKeys = new Set<string>();

function showFindingDiagram(idx: number, open: boolean, content: HTMLElement): void {
  const finding = currentFindings[idx];
  if (!finding) return;
  const key = findingKey(finding);
  if (!open) { openDiagramKeys.delete(key); return; }
  openDiagramKeys.add(key);
  if (!currentDoc) return;

  const canvas = document.createElement("canvas");
  canvas.width = 740;
  canvas.height = 260;
  canvas.className = "finding-diagram";

  const r = renderFindingDiagram(canvas, currentDoc, finding, { metrics, theme: defaultTheme });
  if (!r.rendered || !r.diagram) {
    const reason = document.createElement("p");
    reason.className = "diagram-reason";
    reason.textContent = r.reason ?? "couldn't diagram this one.";
    content.append(reason);
    return;
  }
  const label = document.createElement("div");
  label.className = "diagram-label";
  label.textContent = strategyLabel(r.diagram.highlight.strategy);
  content.append(label, canvas);
}

// ---------------------------------------------------------------------------------------------
// Toggles
// ---------------------------------------------------------------------------------------------

function renderTogglesPanel(): void {
  renderToggles(togglesEl, RULES, toggles, (ruleId, enabled) => {
    toggles = { ...toggles, [ruleId]: enabled };
    saveToggles(window.localStorage, toggles);
    if (currentDoc) renderAll(currentDoc, currentText); // re-run rules only — no re-parse needed
  });
}

// ---------------------------------------------------------------------------------------------
// Apply mechanical fixes: fixLoop over the rule-based analysis (the "fast", zero-download path —
// the fixer framework doesn't need the neural parser, and running it against whatever is on
// screen right now keeps this button instant).
// ---------------------------------------------------------------------------------------------

function runFixes(): void {
  if (!currentText.trim()) return;
  const rules = rulesFor();
  const result = fixLoop(rules, currentText, defaultProvider, { analyze: buildDocAnalysis });
  lastFix = { result, original: currentText };
  const diff = computeFixDiff(currentText, result.steps);
  fixPanelEl.hidden = false;
  renderFixDiff(fixDiffEl, currentText, result.text, diff, result.applied.length, result.after.findings.length);
  acceptBtn.disabled = result.applied.length === 0;
}

function acceptFix(): void {
  if (!lastFix) return;
  textareaEl.value = lastFix.result.text;
  fixPanelEl.hidden = true;
  lastFix = null;
  lint();
}

function discardFix(): void {
  fixPanelEl.hidden = true;
  lastFix = null;
}

// ---------------------------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------------------------

textareaEl.addEventListener("focus", ensureModel);
lintBtn.addEventListener("click", lint);
fixBtn.addEventListener("click", runFixes);
acceptBtn.addEventListener("click", acceptFix);
discardBtn.addEventListener("click", discardFix);

fixPanelEl.hidden = true;
renderTogglesPanel();
lint(); // draws the empty-state score/findings panels; does not touch the model

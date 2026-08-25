// DOM rendering for destink.html. Kept apart from main.ts (wiring/state) and from highlight.ts /
// diff.ts (pure, vitest-tested logic) so the untestable "build some elements" code is small and
// easy to eyeball, and the logic worth unit-testing doesn't need a browser to run.

import type { Report, ReportFinding } from "../lint/report.js";
import type { Severity, TropeRule, TropeTier } from "../lint/types.js";
import type { RuleToggles } from "../lint/registry.js";
import { TIERS } from "../lint/score.js";
import { segmentSpans } from "./highlight.js";
import type { FixDiff } from "./diff.js";
import type { HighlightStrategy } from "./diagram-finding.js";

// Plain-English label for #26's selection strategy, shown above a rendered diagram so the reader
// knows what they're looking at before they parse the lit-up shape themselves.
const STRATEGY_LABEL: Record<HighlightStrategy, string> = {
  reframe: "the shape of the reframe",
  compound: "the shape of the compound",
  "whole-unit": "the flagged sentence(s)",
  span: "the flagged words",
};
export const strategyLabel = (s: HighlightStrategy): string => STRATEGY_LABEL[s];

const TIER_LABEL: Record<TropeTier, string> = {
  lexical: "Lexical",
  syntactic: "Syntactic",
  formatting: "Formatting",
  discourse: "Discourse",
};

const SEVERITY_LABEL: Record<Severity, string> = {
  candidate: "candidate",
  low: "low",
  medium: "medium",
  high: "high",
};

const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// ---------------------------------------------------------------------------------------------
// Score
// ---------------------------------------------------------------------------------------------

export function renderScore(el: HTMLElement, report: Report): void {
  const fmt = (n: number): string => n.toFixed(1);
  const tierRows = TIERS.map(
    (t) => `<div class="tier-row"><span class="tier-name">${TIER_LABEL[t]}</span><span class="tier-val">${fmt(report.score.byTier[t])}</span></div>`,
  ).join("");
  el.innerHTML = `
    <div class="total">${fmt(report.score.total)}<span class="unit">stink / 1000 words</span></div>
    <div class="tiers">${tierRows}</div>
    <div class="meta">${report.wordCount} words &nbsp;·&nbsp; ${report.counts.findings} finding${report.counts.findings === 1 ? "" : "s"}</div>
  `;
}

// ---------------------------------------------------------------------------------------------
// Toggles
// ---------------------------------------------------------------------------------------------

// `onChange` fires with the rule id and its new enabled state; the caller owns the toggles object
// and persistence — this function only draws checkboxes and reports clicks.
export function renderToggles(el: HTMLElement, rules: readonly TropeRule[], toggles: RuleToggles, onChange: (ruleId: string, enabled: boolean) => void): void {
  el.textContent = "";
  for (const tier of TIERS) {
    const inTier = rules.filter((r) => r.tier === tier);
    if (inTier.length === 0) continue;
    const group = document.createElement("div");
    group.className = "toggle-group";
    const heading = document.createElement("div");
    heading.className = "toggle-heading";
    heading.textContent = TIER_LABEL[tier];
    group.append(heading);
    for (const rule of inTier) {
      const label = document.createElement("label");
      label.className = "toggle-row";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = toggles[rule.id] !== false;
      checkbox.addEventListener("change", () => onChange(rule.id, checkbox.checked));
      label.append(checkbox, document.createTextNode(" " + rule.name));
      group.append(label);
    }
    el.append(group);
  }
}

// ---------------------------------------------------------------------------------------------
// Annotated text (the read-only highlight overlay)
// ---------------------------------------------------------------------------------------------

// Max severity among a set of finding indices, for picking a segment's background — "high" wins
// over everything, "candidate" is the faintest. Falls back to "low" for an empty set (unreachable
// in practice: a plain-text segment has findingIdxs.length === 0 and is never marked at all).
const SEVERITY_RANK: Record<Severity, number> = { candidate: 0, low: 1, medium: 2, high: 3 };
function maxSeverity(idxs: readonly number[], findings: readonly ReportFinding[]): Severity {
  let best: Severity = "low";
  let bestRank = -1;
  for (const i of idxs) {
    const sev = findings[i]!.severity;
    if (SEVERITY_RANK[sev] > bestRank) { best = sev; bestRank = SEVERITY_RANK[sev]; }
  }
  return best;
}

// Renders `text` with a <mark> per non-plain segment from segmentSpans (see that module for the
// overlap-handling rationale: disjoint segments, findings stack rather than nest). Each mark's
// `data-findings` attribute is a space-separated list of finding indices it covers, so a click
// handler installed by the caller (or renderFindingsList's counterpart) can select every mark for
// one finding with `[data-findings~="i"]` even when that finding spans several segments.
export function renderAnnotatedText(el: HTMLElement, text: string, findings: readonly ReportFinding[]): void {
  const segs = segmentSpans(text.length, findings.map((f) => f.span));
  let html = "";
  for (const seg of segs) {
    const slice = esc(text.slice(seg.start, seg.end));
    if (seg.findingIdxs.length === 0) { html += slice; continue; }
    const sev = maxSeverity(seg.findingIdxs, findings);
    const stacked = seg.findingIdxs.length > 1 ? " stacked" : "";
    html += `<mark class="sev-${sev}${stacked}" data-findings="${seg.findingIdxs.join(" ")}">${slice}</mark>`;
  }
  el.innerHTML = html || "<span class=\"empty\">(nothing to show yet)</span>";
}

// Scroll to and briefly flash every mark belonging to finding `idx`.
export function flashFinding(root: HTMLElement, idx: number): void {
  const marks = root.querySelectorAll<HTMLElement>(`[data-findings~="${idx}"]`);
  marks.forEach((m, i) => {
    if (i === 0) m.scrollIntoView({ behavior: "smooth", block: "center" });
    m.classList.add("flash");
    setTimeout(() => m.classList.remove("flash"), 900);
  });
}

// ---------------------------------------------------------------------------------------------
// Findings list, grouped by tier
// ---------------------------------------------------------------------------------------------

// The diagram-the-finding (#26) hookup for one findings-list render. `isOpen` decides which
// panels main.ts wants drawn immediately (carried over from before a re-lint, by stable finding
// key — see diagram-panels.ts); `onToggle` does the actual drawing/clearing into `content` when
// the reader clicks the button, or when a panel is reopened automatically.
export type DiagramToggle = {
  isOpen: (idx: number) => boolean;
  onToggle: (idx: number, open: boolean, content: HTMLElement) => void;
};

// `onSelect` is called with the finding's index into `findings` (the same index space
// renderAnnotatedText used) when the reader clicks its row.
export function renderFindingsList(el: HTMLElement, findings: readonly ReportFinding[], onSelect: (idx: number) => void, diagram: DiagramToggle): void {
  el.textContent = "";
  if (findings.length === 0) {
    el.innerHTML = "<p class=\"empty\">No findings — either it's clean, or every rule is off.</p>";
    return;
  }
  for (const tier of [...TIERS, null]) {
    const idxs = findings.reduce<number[]>((acc, f, i) => { if (f.tier === tier) acc.push(i); return acc; }, []);
    if (idxs.length === 0) continue;
    const section = document.createElement("section");
    section.className = "tier-section";
    const heading = document.createElement("h3");
    heading.textContent = tier ? TIER_LABEL[tier] : "Other";
    section.append(heading);
    for (const idx of idxs) {
      const f = findings[idx]!;
      const item = document.createElement("div");
      item.className = "finding";
      item.dataset.findingIdx = String(idx);
      item.innerHTML = `
        <div class="finding-head">
          <span class="badge sev-${f.severity}">${SEVERITY_LABEL[f.severity]}</span>
          <span class="finding-msg">${esc(f.message)}</span>
        </div>
        <div class="finding-explain">${esc(f.explanation)}</div>
      `;

      // The diagram-the-finding (#26) mount: identified by data-finding-idx (index into this same
      // findings array) and data-rule-id, so #26-adjacent code or a future feature can find it.
      const mount = document.createElement("div");
      mount.className = "diagram-mount";
      mount.dataset.findingIdx = String(idx);
      mount.dataset.ruleId = f.ruleId;

      const content = document.createElement("div");
      content.className = "diagram-content";

      let open = diagram.isOpen(idx);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "show-diagram-btn";
      const syncLabel = (): void => { btn.textContent = open ? "Hide diagram" : "Show me"; };
      syncLabel();
      btn.addEventListener("click", (ev) => {
        ev.stopPropagation(); // the row's own click flashes the text highlight — don't also do that
        open = !open;
        syncLabel();
        if (!open) content.textContent = "";
        diagram.onToggle(idx, open, content);
      });

      mount.append(btn, content);
      if (open) diagram.onToggle(idx, true, content); // reopened after a re-lint — draw right away
      item.append(mount);

      item.addEventListener("click", () => onSelect(idx));
      section.append(item);
    }
    el.append(section);
  }
}

// ---------------------------------------------------------------------------------------------
// Fix diff (before / after)
// ---------------------------------------------------------------------------------------------

function markRanges(text: string, ranges: readonly { start: number; end: number }[], tag: "del" | "ins"): string {
  let html = "";
  let cursor = 0;
  for (const r of ranges) {
    html += esc(text.slice(cursor, r.start));
    html += `<${tag}>${esc(text.slice(r.start, r.end))}</${tag}>`;
    cursor = r.end;
  }
  html += esc(text.slice(cursor));
  return html;
}

export function renderFixDiff(el: HTMLElement, original: string, fixed: string, diff: FixDiff, appliedCount: number, remainingFindings: number): void {
  el.innerHTML = `
    <p class="fix-summary">${appliedCount} mechanical fix${appliedCount === 1 ? "" : "es"} applied &nbsp;·&nbsp; ${remainingFindings} finding${remainingFindings === 1 ? "" : "s"} remaining</p>
    <div class="fix-cols">
      <div class="fix-col"><div class="fix-col-label">before</div><pre class="fix-text">${markRanges(original, diff.removed, "del")}</pre></div>
      <div class="fix-col"><div class="fix-col-label">after</div><pre class="fix-text">${markRanges(fixed, diff.added, "ins")}</pre></div>
    </div>
  `;
}

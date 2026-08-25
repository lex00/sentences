// Tests for the painting half of diagram-the-finding (#26). Canvas2D isn't available in node, so
// the module puts its two drawing calls behind DiagramSurface and this file drives the whole
// module through a recording surface — the render CONTRACT (what gets drawn, in what order, in
// which colour, and when nothing is drawn at all) is fully covered; the pixel-level fillText /
// stroke calls inside canvasSurface() are not, the same trade the repo's other renderer-adjacent
// tests make (svg.test.ts asserts markup, not pixels).

import { describe, expect, test } from "vitest";
import type { Clause, Nominal, Word } from "../ir.js";
import type { DocAnalysis, Finding, UnitAnalysis } from "../lint/types.js";
import type { TextMetrics } from "../layout.js";
import type { DiagramSurface, HighlightPaint } from "./diagram-finding.js";
import { defaultTheme, blueprintTheme } from "../theme.js";
import { makeDoc, wordSpans } from "../lint/stub-doc.js";
import {
  paintFindingDiagram,
  findingPalette,
  highlightBounds,
  sceneToScreen,
  LIGHT_FINDING_PALETTE,
  DARK_FINDING_PALETTE,
} from "./diagram-finding.js";

const metrics: TextMetrics = { measure: (t, sz) => ({ width: t.length * sz * 0.55, ascent: sz * 0.8, descent: sz * 0.2 }) };

const word = (text: string, pos?: string): Word => (pos === undefined ? { text } : { text, pos });
const nominal = (text: string, pos?: string): Nominal => ({ head: word(text, pos), modifiers: [] });

const copular = (subj: string, comp: string, neg: boolean): Clause => ({
  subject: nominal(subj, "PRP"),
  verb: { head: word("is", "VBZ"), modifiers: neg ? [{ kind: "word", value: word("not") }] : [] },
  complement: { kind: "predicateAdj", value: word(comp, "JJ") },
});

function docOf(text: string, clausesByUnit: Array<Clause[] | null>): DocAnalysis {
  const doc = makeDoc(text, (_u, i) => (clausesByUnit[i] ? "lowered" : "fragment"));
  doc.units.forEach((u: UnitAnalysis, i) => {
    const cs = clausesByUnit[i];
    if (!cs) return;
    u.clauses = cs;
    u.words = wordSpans(text, u.span);
  });
  return doc;
}

const finding = (ruleId: string, start: number, end: number): Finding => ({
  ruleId, span: { start, end }, severity: "medium", message: "m", explanation: "e",
});

// A surface that records instead of drawing.
function recorder(): DiagramSurface & { calls: string[]; paints: HighlightPaint[] } {
  const calls: string[] = [];
  const paints: HighlightPaint[] = [];
  return {
    calls,
    paints,
    drawScene() { calls.push("drawScene"); },
    highlight(paint) { calls.push("highlight"); paints.push(paint); },
  };
}

const TEXT = "It is not bold. It is backwards.";
const reframeDoc = docOf(TEXT, [[copular("It", "bold", true)], [copular("It", "backwards", false)]]);
const reframeFinding = finding("reframe", TEXT.indexOf("not"), TEXT.length);

describe("paintFindingDiagram", () => {
  test("draws the diagram first, then layers the highlight on top", () => {
    const s = recorder();
    const r = paintFindingDiagram(s, reframeDoc, reframeFinding, { metrics });
    expect(r.rendered).toBe(true);
    expect(s.calls).toEqual(["drawScene", "highlight"]);
  });

  test("hands the surface the selected marks and a finding colour", () => {
    const s = recorder();
    paintFindingDiagram(s, reframeDoc, reframeFinding, { metrics });
    const paint = s.paints[0]!;
    const words = paint.elements.filter((e) => e.kind === "word").map((e) => (e.kind === "word" ? e.text : ""));
    expect(words).toEqual(expect.arrayContaining(["not", "bold", "backwards"]));
    expect(paint.palette.ink).toBe(LIGHT_FINDING_PALETTE.ink);
    expect(paint.sizePx).toBe(16);
  });

  test("returns the diagram so the caller can label or hit-test it", () => {
    const s = recorder();
    const r = paintFindingDiagram(s, reframeDoc, reframeFinding, { metrics });
    expect(r.diagram?.highlight.strategy).toBe("reframe");
    expect(r.diagram?.scene.root.role).toBe("sentence");
  });

  test("draws nothing at all when the finding has no diagrammable structure", () => {
    const s = recorder();
    const doc = makeDoc("**Security**: environment-based configuration\n");
    const r = paintFindingDiagram(s, doc, finding("formatting/bold-first-bullet", 0, 12), { metrics });
    expect(r.rendered).toBe(false);
    expect(r.reason).toBeTruthy();
    expect(s.calls).toEqual([]);
  });

  test("an explicit palette overrides the theme's", () => {
    const s = recorder();
    const palette = { ink: "#00ff00", halo: "rgba(0,255,0,.2)", glow: "rgba(0,255,0,.6)" };
    paintFindingDiagram(s, reframeDoc, reframeFinding, { metrics, palette });
    expect(s.paints[0]!.palette).toBe(palette);
  });
});

describe("findingPalette", () => {
  test("crimson on the light theme — distinct from its navy role highlight", () => {
    const p = findingPalette(defaultTheme);
    expect(p).toBe(LIGHT_FINDING_PALETTE);
    expect(p.ink).not.toBe(defaultTheme.emphasis("word", "active").color);
    expect(p.ink).not.toBe(defaultTheme.emphasis("word", "hover").color);
  });

  test("hot pink on the dark blueprint theme — distinct from its amber role highlight", () => {
    const p = findingPalette(blueprintTheme);
    expect(p).toBe(DARK_FINDING_PALETTE);
    expect(p.ink).not.toBe(blueprintTheme.emphasis("word", "active").color);
  });

  test("the two palettes differ, so a theme swap is visible", () => {
    expect(LIGHT_FINDING_PALETTE.ink).not.toBe(DARK_FINDING_PALETTE.ink);
  });
});

describe("geometry helpers", () => {
  test("highlightBounds covers every lit mark", () => {
    const s = recorder();
    const r = paintFindingDiagram(s, reframeDoc, reframeFinding, { metrics });
    const b = highlightBounds(r.diagram!.highlight)!;
    expect(b.right).toBeGreaterThan(b.left);
    expect(b.bottom).toBeGreaterThan(b.top);
    for (const el of r.diagram!.highlight.elements) {
      expect(el.bbox.left).toBeGreaterThanOrEqual(b.left);
      expect(el.bbox.right).toBeLessThanOrEqual(b.right);
    }
  });

  test("sceneToScreen inverts screenToScene's transform", () => {
    const view = { s: 0.5, tx: 12, ty: -4 };
    expect(sceneToScreen({ x: 10, y: 20 }, view)).toEqual({ x: 17, y: 6 });
  });
});

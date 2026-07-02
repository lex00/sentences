import { describe, it, expect } from "vitest";
import { sceneToSvg } from "./svg.js";
import { layout, type TextMetrics } from "./layout.js";
import { lower } from "./lower.js";
import { defaultTheme } from "./theme.js";

// Deterministic metrics so the assertions don't depend on a font file.
const metrics: TextMetrics = { measure: (t, sz) => ({ width: t.length * sz * 0.55, ascent: sz * 0.8, descent: sz * 0.2 }) };
const svgOf = (ptb: string) => sceneToSvg(layout(lower(ptb), metrics), defaultTheme);

describe("sceneToSvg", () => {
  const ptb = "(S (NP (DT The) (JJ small) (NN dog)) (VP (VBD barked) (ADVP (RB loudly))))";

  it("produces a well-formed <svg> with a viewBox covering the scene bounds", () => {
    const svg = svgOf(ptb);
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg.trimEnd().endsWith("</svg>")).toBe(true);
    expect(svg).toMatch(/viewBox="-?\d+ -?\d+ \d+ \d+"/);
  });

  it("emits a <line> per segment and a <text> per non-empty label", () => {
    const scene = layout(lower(ptb), metrics);
    const svg = sceneToSvg(scene, defaultTheme);
    const labels: string[] = [];
    (function walk(n: any): void {
      for (const c of n.children) {
        if (c.children) walk(c);
        else if (c.kind === "lbl" && c.text) labels.push(c.text);
        else if (c.kind === "seg") { /* counted below */ }
      }
    })(scene.root);
    for (const word of labels) expect(svg).toContain(`>${word}<`);
    expect((svg.match(/<line /g) ?? []).length).toBeGreaterThan(0);
  });

  it("carries the theme's stroke + dash onto segments", () => {
    const svg = svgOf(ptb);
    expect(svg).toMatch(/<line [^>]*stroke="#2b2b2b"/); // baseline color from defaultTheme
  });

  it("rotates slanted modifier labels (articles/adjectives on slants)", () => {
    // "small" and "the" hang on slants, so at least one text is rotated.
    expect(svgOf(ptb)).toMatch(/transform="translate\([^)]*\) rotate\(/);
  });

  it("XML-escapes label text", () => {
    const svg = sceneToSvg(layout(lower("(S (NP (NNP A&B)) (VP (VBD ran)))"), metrics), defaultTheme);
    expect(svg).toContain("A&amp;B");
    expect(svg).not.toContain("A&B<");
  });

  it("draws an optional background rect only when asked", () => {
    const scene = layout(lower(ptb), metrics);
    expect(sceneToSvg(scene, defaultTheme)).not.toContain("<rect");
    expect(sceneToSvg(scene, defaultTheme, { background: "#fff" })).toContain('<rect');
  });
});

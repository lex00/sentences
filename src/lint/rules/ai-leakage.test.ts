import { describe, it, expect } from "vitest";
import { makeDoc } from "../stub-doc.js";
import { textAt } from "../span.js";
import { aiLeakageRule } from "./ai-leakage.js";

describe("claude/ai-leakage — family A (leaked artifacts)", () => {
  it("fires high, single hit, on a leaked citation tag", () => {
    const text = "The model answered the question oaicite:0 with confidence.";
    const findings = aiLeakageRule.detect(makeDoc(text));
    expect(findings).toHaveLength(1);
    expect(textAt(text, findings[0]!.span)).toBe("oaicite");
    expect(findings[0]!.severity).toBe("high");
  });

  it("recognizes the whole artifact family: contentReference, turn0search, attributableIndex, grok tags, ppl upload tags, :::writing", () => {
    const cases = [
      "See contentReference[oaicite:0]{index=0} for the source.",
      "Per turn0search3, the claim checks out.",
      "The attributableIndex field pointed at nothing useful.",
      "Rendered via grok_card and grok_render_citation_card_json blocks.",
      "Uploaded through ppl-ai-file-upload before the attached_file resolved.",
      ":::writing a first draft here",
    ];
    for (const text of cases) {
      const findings = aiLeakageRule.detect(makeDoc(text));
      expect(findings.length, `expected a hit in: ${text}`).toBeGreaterThan(0);
      expect(findings.every((f) => f.severity === "high")).toBe(true);
    }
  });

  it("fires on citation bracket artifacts and lenticular brackets", () => {
    const cases = ["Per the source [cite: 12] this holds.", "See [span_42] for context.", "(start_span)this claim(start_span)", "The result 【6†source】 was cited."];
    for (const text of cases) {
      const findings = aiLeakageRule.detect(makeDoc(text));
      expect(findings.length, `expected a hit in: ${text}`).toBeGreaterThan(0);
    }
  });

  it("matches 'regenerate response' case-insensitively", () => {
    const findings = aiLeakageRule.detect(makeDoc("Click Regenerate Response to try again."));
    expect(findings).toHaveLength(1);
    expect(textAt("Click Regenerate Response to try again.", findings[0]!.span)).toBe("Regenerate Response");
  });

  it("flags utm_source only when it sits inside a URL, spanning just the key", () => {
    const text = "Share this: https://example.com/post?utm_source=chatgpt.com&utm_medium=referral";
    const findings = aiLeakageRule.detect(makeDoc(text));
    expect(findings).toHaveLength(1);
    expect(textAt(text, findings[0]!.span)).toBe("utm_source=");
  });

  it("stays quiet on utm_source= mentioned outside of a URL", () => {
    const text = "The tracking parameter utm_source=chatgpt.com only matters when it's part of a link.";
    expect(aiLeakageRule.detect(makeDoc(text))).toEqual([]);
  });

  it("downgrades to low (does not suppress) inside a fenced code block", () => {
    const text = ["prose before", "```", "const cite = 'oaicite:0';", "```", "prose after"].join("\n");
    const findings = aiLeakageRule.detect(makeDoc(text));
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe("low");
    expect(textAt(text, findings[0]!.span)).toBe("oaicite");
  });
});

describe("claude/ai-leakage — family B (assistant boilerplate)", () => {
  it("fires high on an unambiguous self-description phrase", () => {
    const text = "As an AI language model, I don't have opinions.";
    const findings = aiLeakageRule.detect(makeDoc(text));
    expect(findings.some((f) => f.severity === "high" && textAt(text, f.span) === "As an AI language model")).toBe(true);
  });

  it("fires high on a knowledge-cutoff disclosure, and collapses an overlapping shorter match into one finding", () => {
    const text = "As of my last knowledge update, the treaty had not been ratified.";
    const findings = aiLeakageRule.detect(makeDoc(text));
    // "As of my last knowledge update" also contains "my last knowledge update" — only the longer,
    // outer match should survive the overlap cleanup.
    expect(findings).toHaveLength(1);
    expect(textAt(text, findings[0]!.span)).toBe("As of my last knowledge update");
    expect(findings[0]!.severity).toBe("high");
  });

  it("fires high on refusal boilerplate and the certainly-opener", () => {
    const a = aiLeakageRule.detect(makeDoc("I cannot fulfill this request as described."));
    expect(a.some((f) => f.severity === "high")).toBe(true);
    const b = aiLeakageRule.detect(makeDoc("Certainly, here is the summary you asked for."));
    expect(b.some((f) => f.severity === "high" && textAt("Certainly, here is the summary you asked for.", f.span) === "Certainly, here is")).toBe(true);
  });

  it("fires medium on a closer a human could plausibly write", () => {
    const text = "I hope this helps with your project.";
    const findings = aiLeakageRule.detect(makeDoc(text));
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe("medium");
  });

  it("matches boilerplate case-insensitively", () => {
    const findings = aiLeakageRule.detect(makeDoc("i hope this helps!"));
    expect(findings).toHaveLength(1);
  });

  it("still fires when the phrase is quoted while discussing AI detection (documented decision: quoted mentions fire)", () => {
    const text = "One reviewer noted that the phrase \"as an AI language model\" is a classic tell.";
    const findings = aiLeakageRule.detect(makeDoc(text));
    expect(findings.some((f) => textAt(text, f.span) === "as an AI language model")).toBe(true);
  });

  it("suppresses (not downgrades) boilerplate inside a fenced code block", () => {
    const text = ["prose", "```", "// I hope this helps future maintainers", "```", "more prose"].join("\n");
    expect(aiLeakageRule.detect(makeDoc(text))).toEqual([]);
  });

  it("does not fire on 'certainly' alone or 'here is the report' alone", () => {
    expect(aiLeakageRule.detect(makeDoc("Certainly, this will take some time."))).toEqual([]);
    expect(aiLeakageRule.detect(makeDoc("Here is the report you requested."))).toEqual([]);
  });
});

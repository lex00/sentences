import { describe, it, expect } from "vitest";
import { runRules } from "../engine.js";
import { buildDocAnalysis } from "../build-doc.js";
import { spanOf } from "../stub-doc.js";
import { lowValueSentenceRule } from "./low-value-sentence.js";

const run = (text: string) => runRules([lowValueSentenceRule], buildDocAnalysis(text)).findings;

// 34 words of setup, so one more ordinary sentence carries the paragraph past the 50-word gate.
const LEAD =
  "The scheduler rewrite cost us two quarters and shipped in March, a full release behind the roadmap " +
  "we had published in January. Every downstream team planned against that roadmap and had to replan twice.";

// Every content word (rewrite, scheduler, cost, two, quarters) is already in LEAD.
const RECAP = "The rewrite of the scheduler was what cost those two quarters.";

// n words of throwaway prose, each token distinct so none of it can look recycled.
const filler = (n: number): string => `${Array.from({ length: n }, (_, i) => `alpha${i}`).join(" ")}.`;

describe("discourse/low-value-sentence", () => {
  it("fires on a sentence whose every content word is already in the paragraph", () => {
    const text = `${LEAD} ${RECAP} Nobody on the platform side had budgeted for a second replan.`;
    const findings = run(text);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.ruleId).toBe("discourse/low-value-sentence");
    expect(findings[0]!.span).toEqual(spanOf(text, "The rewrite of the scheduler was what cost those two quarters"));
    expect(findings[0]!.message).toContain("already appeared earlier in the paragraph");
  });

  it("names the echoed words in the explanation", () => {
    const findings = run(`${LEAD} ${RECAP} Nobody on the platform side had budgeted for a second replan.`);
    expect(findings[0]!.explanation).toContain("“scheduler”");
    expect(findings[0]!.explanation).toContain("“rewrite”");
  });

  it("folds inflections, so a plural is not a new content word", () => {
    const text =
      `${filler(40)} The parser tracked every offset in the document. ` +
      "Those parsers track the offsets in those documents.";
    expect(run(text)).toHaveLength(1);
  });

  // --- the 50-word gate -------------------------------------------------------------------

  it("stays silent on the same restatement in a short paragraph", () => {
    expect(run(`The scheduler rewrite cost us two quarters. ${RECAP}`)).toEqual([]);
  });

  it("is exclusive at the boundary: 50 words silent, 51 words fires", () => {
    const pair = "The parser reads the input. The input is what the parser reads.";
    expect(run(`${filler(38)} ${pair}`)).toEqual([]); // 38 + 5 + 7 = 50
    expect(run(`${filler(39)} ${pair}`)).toHaveLength(1); // 51
  });

  it("stays silent on a long paragraph that is a single sentence", () => {
    expect(run(`${filler(60)}`)).toEqual([]);
  });

  // --- what it refuses to call ------------------------------------------------------------

  it("never fires on the sentence that opens a paragraph", () => {
    // The opener's content words are all in the PREVIOUS paragraph, and it still stays clean.
    const text = `${LEAD}\n\n${RECAP} ${filler(45)}`;
    expect(run(text)).toEqual([]);
  });

  it("stays silent on a recycled sentence too thin to judge", () => {
    // "So the rewrite failed" — two content words, both echoes, and a legitimate conclusion.
    const text = `${LEAD} So the rewrite failed. Nobody on the platform side had budgeted for that.`;
    expect(run(text)).toEqual([]);
  });

  it("stays silent when the sentence introduces two new content words", () => {
    const text = `${LEAD} The scheduler rewrite also broke the nightly export job.`;
    expect(run(text)).toEqual([]);
  });

  it("scopes to the paragraph: the same sentence fires joined and stays clean split", () => {
    const tail = `${filler(45)} ${RECAP}`;
    expect(run(`${LEAD}\n\n${tail}`)).toEqual([]);
    expect(run(`${LEAD} ${tail}`)).toHaveLength(1);
  });

  it("stays out of bullets and headings, which are never paragraphs", () => {
    const text = `# ${LEAD}\n\n- ${RECAP}\n- ${filler(45)}`;
    expect(run(text)).toEqual([]);
  });

  // --- the thin-sentence candidate ---------------------------------------------------------

  it("reports a long sentence with exactly one new content word as a candidate", () => {
    const text =
      `${LEAD} The scheduler rewrite cost two quarters against the roadmap that every downstream team had ` +
      "planned against, belatedly.";
    const findings = run(text);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe("candidate");
    expect(findings[0]!.message).toContain("1 of them new");
  });

  // --- density ------------------------------------------------------------------------------

  it("escalates severity with the number of restatements in the document", () => {
    const one = `${LEAD} ${RECAP} Nobody had budgeted for a second replan.`;
    expect(run(one).map((f) => f.severity)).toEqual(["low"]);

    const two = `${one}\n\n${LEAD} ${RECAP} Nobody had budgeted for a second replan.`;
    expect(new Set(run(two).map((f) => f.severity))).toEqual(new Set(["medium"]));

    const three = `${two}\n\n${LEAD} ${RECAP} Nobody had budgeted for a second replan.`;
    expect(new Set(run(three).map((f) => f.severity))).toEqual(new Set(["high"]));
    expect(run(three)[0]!.explanation).toContain("3 sentences in this piece");
  });

  it("returns findings in document order with spans that slice the source", () => {
    const para = `${LEAD} ${RECAP} Nobody had budgeted for a second replan.`;
    const text = `${para}\n\n${para}`;
    const findings = run(text);
    expect(findings).toHaveLength(2);
    expect(findings[0]!.span.start).toBeLessThan(findings[1]!.span.start);
    for (const f of findings) {
      expect(text.slice(f.span.start, f.span.end)).toContain("The rewrite of the scheduler");
    }
  });

  it("reports nothing on an empty document", () => {
    expect(run("")).toEqual([]);
  });
});

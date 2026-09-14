import { describe, it, expect } from "vitest";
import {
  LINT_FORMATS,
  excerpt,
  formatRules,
  formatScore,
  formatSummary,
  lineCol,
  lineStarts,
  listRules,
  markdownDefault,
  parseLintArgs,
  parseRulesArgs,
  readSource,
  runLint,
  runRulesList,
} from "./tools.js";
import { lintDocument } from "../lint/run.js";
import { RULES } from "../lint/registry.js";

const SLOP = "It's not a bug. It's a feature. Let's delve into the details of this robust framework.";

const args = (raw: unknown) => {
  const p = parseLintArgs(raw);
  if (!p.ok) throw new Error(`expected ok, got: ${p.error}`);
  return p.value;
};
const err = (raw: unknown) => {
  const p = parseLintArgs(raw);
  if (p.ok) throw new Error("expected an error");
  return p.error;
};

describe("parseLintArgs", () => {
  it("takes text", () => {
    expect(args({ text: "hello" }).source).toEqual({ kind: "text", text: "hello" });
  });

  it("takes a path", () => {
    expect(args({ path: "a.txt" }).source).toEqual({ kind: "path", path: "a.txt" });
  });

  it("defaults format to summary and markdown to off for inline text", () => {
    expect(args({ text: "hello" })).toMatchObject({ format: "summary", markdown: false });
  });

  it("accepts every declared format", () => {
    for (const format of LINT_FORMATS) expect(args({ text: "x", format }).format).toBe(format);
  });

  it("rejects a non-object", () => {
    for (const raw of [null, undefined, "text", 3, ["text"]]) {
      expect(err(raw)).toBe("arguments must be an object");
    }
  });

  // The failure this catches is the quiet one: a plausible-looking key that no rule reads, linting
  // nothing and reporting a clean document.
  it("rejects unknown keys and names the ones that exist", () => {
    const message = err({ file: "README.md" });
    expect(message).toContain("unknown argument(s): file");
    expect(message).toContain("text, path, markdown, format");
  });

  it("requires exactly one of text and path", () => {
    expect(err({})).toBe("pass `text` (the prose itself) or `path` (a file to read)");
    expect(err({ text: "a", path: "b.txt" })).toBe("pass either `text` or `path`, not both");
  });

  it("type-checks each field", () => {
    expect(err({ text: 3 })).toBe("`text` must be a string");
    expect(err({ path: 3 })).toBe("`path` must be a string");
    expect(err({ path: "   " })).toBe("`path` must not be empty");
    expect(err({ text: "a", markdown: "true" })).toBe("`markdown` must be a boolean");
    expect(err({ text: "a", format: "verbose" })).toContain("`format` must be one of: summary, score, json");
  });
});

describe("markdownDefault", () => {
  it("is on for a markdown path", () => {
    for (const path of ["README.md", "docs/A.MARKDOWN", "notes.mdx"]) {
      expect(markdownDefault({ path })).toBe(true);
    }
  });

  it("is off for anything else, including inline text", () => {
    for (const path of ["notes.txt", "a.md.bak", "mdx", undefined]) {
      expect(markdownDefault({ path })).toBe(false);
    }
  });

  it("is overridable in both directions", () => {
    expect(args({ path: "README.md", markdown: false }).markdown).toBe(false);
    expect(args({ path: "notes.txt", markdown: true }).markdown).toBe(true);
  });
});

describe("readSource", () => {
  it("passes inline text straight through", () => {
    expect(readSource(args({ text: "hello" }))).toEqual({ ok: true, value: "hello" });
  });

  it("reads a path with the injected reader", () => {
    expect(readSource(args({ path: "a.txt" }), () => "from disk")).toEqual({ ok: true, value: "from disk" });
  });

  it("reports a read failure with the path and the reason, not just the errno", () => {
    const result = readSource(args({ path: "nope.txt" }), () => {
      throw new Error("ENOENT: no such file or directory");
    });
    expect(result).toEqual({ ok: false, error: "could not read nope.txt: ENOENT: no such file or directory" });
  });
});

describe("runLint", () => {
  it("surfaces an argument error instead of throwing", () => {
    expect(runLint({})).toEqual({ ok: false, error: "pass `text` (the prose itself) or `path` (a file to read)" });
  });

  it("reports the same findings as lintDocument", () => {
    const result = runLint({ text: SLOP });
    if (!result.ok) throw new Error(result.error);
    expect(result.report).toEqual(lintDocument(SLOP));
  });

  // The whole reason `json` exists: one contract, two front doors.
  it("json is byte-identical to the report the CLI prints", () => {
    const result = runLint({ text: SLOP, format: "json" });
    if (!result.ok) throw new Error(result.error);
    expect(result.rendered).toBe(JSON.stringify(lintDocument(SLOP), null, 2));
  });

  it("lints a file through the injected reader, markdown on by extension", () => {
    const md = ["```js", "// Let's delve into the details.", "```"].join("\n");
    const result = runLint({ path: "notes.md", format: "json" }, () => md);
    if (!result.ok) throw new Error(result.error);
    expect(result.report.findings).toEqual([]);

    const asProse = runLint({ path: "notes.md", markdown: false, format: "json" }, () => md);
    if (!asProse.ok) throw new Error(asProse.error);
    expect(asProse.report.counts.byRule["lex-delve-family"]).toBe(1);
  });

  // `score` keeps the per-rule counts — a rule id is a label, not a finding — but drops every
  // located finding: no excerpts, no explanations, nothing that scales with document length. That is
  // what makes it the cheap call for "did my edit help?".
  it("score keeps the counts and drops the located findings", () => {
    const score = runLint({ text: SLOP, format: "score" });
    const summary = runLint({ text: SLOP, format: "summary" });
    if (!score.ok || !summary.ok) throw new Error("expected both to lint");

    expect(score.rendered).toContain("rules: lex-delve-family");
    expect(score.rendered).not.toContain("> ");
    for (const f of summary.report.findings) expect(score.rendered).not.toContain(f.explanation);

    expect(summary.rendered).toContain("lex-delve-family");
    expect(summary.rendered.length).toBeGreaterThan(score.rendered.length);
  });
});

describe("formatSummary", () => {
  const report = lintDocument(SLOP);

  it("leads with the count, the word count and the score", () => {
    expect(formatSummary(SLOP, report).split("\n")[0]).toBe(
      `destink: ${report.counts.findings} findings in ${report.wordCount} words; score ${report.score.total} (weighted findings per 1000 words)`,
    );
  });

  it("locates every finding as line:col with its excerpt", () => {
    const out = formatSummary(SLOP, report);
    for (const f of report.findings) {
      expect(out).toContain(`${f.ruleId}: ${f.message}`);
      expect(out).toContain(`> ${excerpt(SLOP, f)}`);
    }
  });

  it("prints each rule's explanation once and says how many it held back", () => {
    const out = formatSummary(SLOP, report);
    const delve = report.findings.filter((f) => f.ruleId === "lex-delve-family");
    expect(delve.length).toBeGreaterThan(1);
    const explanation = delve[0]!.explanation;
    expect(out.split(explanation)).toHaveLength(2); // one split point => exactly one occurrence
    expect(out).toContain("further finding");
  });

  it("says so plainly when there is nothing to report", () => {
    const clean = "The cat sat on the mat.";
    expect(formatSummary(clean, lintDocument(clean))).toBe(
      "destink: no findings in 6 words; score 0 (weighted findings per 1000 words)",
    );
  });

  it("rounds the score for reading but never invents precision in the report", () => {
    const text = `${SLOP} ${SLOP}`;
    const r = lintDocument(text);
    const shown = formatScore(r).split("\n")[0]!;
    expect(shown).toMatch(/score \d+(\.\d)? \(/);
    expect(r.score.total % 1 === 0 || String(r.score.total).length >= shown.length - 1).toBe(true);
  });
});

describe("excerpt", () => {
  const at = (start: number, end: number) =>
    ({ ruleId: "r", tier: null, severity: "low", span: { start, end }, message: "", explanation: "" }) as const;

  it("collapses the whitespace a multi-sentence span drags in", () => {
    const text = "One.\n\n   Two.";
    expect(excerpt(text, at(0, text.length))).toBe("One. Two.");
  });

  it("truncates a long span so one finding cannot bury the next", () => {
    const text = "word ".repeat(200);
    const out = excerpt(text, at(0, text.length));
    expect(out).toHaveLength(120);
    expect(out.endsWith("...")).toBe(true);
  });

  it("leaves a short span exactly as written", () => {
    const text = "It's not a bug.";
    expect(excerpt(text, at(5, 10))).toBe("not a");
  });
});

describe("lineCol", () => {
  const text = "one\ntwo\n\nfour";
  const starts = lineStarts(text);

  it("indexes every line start", () => {
    expect(starts).toEqual([0, 4, 8, 9]);
  });

  it("is 1-based in both coordinates", () => {
    expect(lineCol(starts, 0)).toEqual({ line: 1, col: 1 });
    expect(lineCol(starts, 2)).toEqual({ line: 1, col: 3 });
    expect(lineCol(starts, 4)).toEqual({ line: 2, col: 1 });
    expect(lineCol(starts, 9)).toEqual({ line: 4, col: 1 });
    expect(lineCol(starts, 12)).toEqual({ line: 4, col: 4 });
  });

  it("puts a newline at the end of the line it terminates", () => {
    expect(lineCol(starts, 3)).toEqual({ line: 1, col: 4 });
  });

  it("handles an empty document and a blank line", () => {
    expect(lineStarts("")).toEqual([0]);
    expect(lineCol(lineStarts(""), 0)).toEqual({ line: 1, col: 1 });
    expect(lineCol(starts, 8)).toEqual({ line: 3, col: 1 });
  });

  it("agrees with a naive scan over the whole document", () => {
    const doc = "alpha beta\ngamma\n\ndelta epsilon\nzeta";
    const idx = lineStarts(doc);
    let line = 1;
    let col = 1;
    for (let i = 0; i < doc.length; i++) {
      expect(lineCol(idx, i)).toEqual({ line, col });
      if (doc[i] === "\n") {
        line++;
        col = 1;
      } else col++;
    }
  });
});

describe("destink_rules", () => {
  it("lists the whole registry in registry order", () => {
    expect(listRules().map((r) => r.id)).toEqual(RULES.map((r) => r.id));
  });

  it("filters by tier", () => {
    const formatting = listRules("formatting");
    expect(formatting.length).toBeGreaterThan(0);
    expect(formatting.every((r) => r.tier === "formatting")).toBe(true);
    expect(formatting.length).toBeLessThan(RULES.length);
  });

  it("accepts no arguments at all", () => {
    for (const raw of [undefined, null, {}]) expect(parseRulesArgs(raw)).toEqual({ ok: true, value: {} });
  });

  it("rejects an unknown key or an unknown tier", () => {
    const unknownKey = parseRulesArgs({ severity: "high" });
    expect(unknownKey.ok).toBe(false);
    const unknownTier = parseRulesArgs({ tier: "vibes" });
    expect(unknownTier.ok).toBe(false);
    if (!unknownTier.ok) expect(unknownTier.error).toContain("lexical, syntactic, formatting, discourse");
  });

  it("renders one aligned line per rule", () => {
    const out = formatRules(listRules("formatting"));
    const body = out.split("\n").slice(2);
    expect(body).toHaveLength(listRules("formatting").length);
    for (const rule of listRules("formatting")) {
      expect(body.some((l) => l.startsWith(rule.id) && l.includes(rule.name))).toBe(true);
    }
  });

  it("runs end to end", () => {
    const result = runRulesList({ tier: "syntactic" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.rendered).toContain("rule(s), in the order findings are attributed");
  });
});

describe("the strictness argument", () => {
  it("defaults to 2, the calibrated level", () => {
    const parsed = parseLintArgs({ text: "some prose" });
    expect(parsed.ok && parsed.value.strictness).toBe(2);
  });

  it("takes the level it is given", () => {
    for (const n of [1, 2, 3]) {
      const parsed = parseLintArgs({ text: "some prose", strictness: n });
      expect(parsed.ok && parsed.value.strictness).toBe(n);
    }
  });

  it("refuses a level outside the dial, naming the ones that exist", () => {
    for (const bad of [0, 4, 2.5, "3", null]) {
      const parsed = parseLintArgs({ text: "some prose", strictness: bad });
      expect(parsed.ok).toBe(false);
      expect(!parsed.ok && parsed.error).toContain("`strictness` must be one of: 1, 2, 3");
    }
  });

  it("changes what the lint reports, which is the whole point of the dial", () => {
    // A trailing phrase the rate gate suppresses at 2 and reports at 3.
    const text =
      `${Array.from({ length: 300 }, (_, i) => `alpha${i}`).join(" ")}. ` +
      "The scheduler rewrite shipped a full release behind the roadmap, with a rule-based fallback parser.";
    const at2 = runLint({ text, format: "score" });
    const at3 = runLint({ text, format: "score", strictness: 3 });
    expect(at2.ok && at3.ok).toBe(true);
    if (at2.ok && at3.ok) {
      expect(at2.report.counts.byRule["discourse/trailing-tail"]).toBeUndefined();
      expect(at3.report.counts.byRule["discourse/trailing-tail"]).toBe(1);
    }
  });
});


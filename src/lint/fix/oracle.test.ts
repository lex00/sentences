import { describe, it, expect } from "vitest";
import { runRules } from "../engine.js";
import { makeDoc } from "../stub-doc.js";
import { spanOf } from "../stub-doc.js";
import { demoIntensifierRule } from "../rules/demo.js";
import type { TropeRule } from "../types.js";
import { refereeEdit, refereeEdits } from "./oracle.js";
import type { OracleEdit, OracleVerdict } from "./oracle.js";
import { idOf } from "./types.js";

const DEMO: readonly TropeRule[] = [demoIntensifierRule];

// Narrows the verdict union for TypeScript AND fails with the referee's own reason when the edit
// was refused, which is the message worth reading when one of these tests breaks.
function accepted(v: OracleVerdict): Extract<OracleVerdict, { accepted: true }> {
  if (!v.accepted) throw new Error(`expected the edit to be accepted, but: ${v.reason}`);
  return v;
}

// A context-sensitive rule, for the one condition the purely-local demo rule cannot demonstrate:
// it flags the word directly after a comma, so an edit can create a finding in words it never
// touched.
const AFTER_COMMA: TropeRule = {
  id: "test/after-comma",
  name: "Word after a comma (test only)",
  tier: "formatting",
  detect: (doc) =>
    doc.units.flatMap((u) =>
      u.words
        .filter((w) => /,\s*$/.test(doc.text.slice(Math.max(0, w.span.start - 2), w.span.start)))
        .map((w) => ({
          ruleId: "test/after-comma",
          span: w.span,
          severity: "low" as const,
          message: `“${w.text}” follows a comma`,
          explanation: "test rule",
        })),
    ),
};
const lint = (t: string) => runRules(DEMO, makeDoc(t));

// The first finding in `text`, as the id an edit has to name.
const target = (text: string, nth = 0) => idOf(lint(text).findings[nth]!);

const edit = (text: string, replacement: string, nth = 0): OracleEdit => ({
  findingId: target(text, nth),
  replacement,
});

describe("refereeEdit", () => {
  const ONE = "This is a very good idea.";

  it("accepts a replacement that removes the finding and brings nothing with it", () => {
    const verdict = accepted(refereeEdit(DEMO, ONE, edit(ONE, "blistering")));
    expect(verdict.text).toBe("This is a blistering good idea.");
    expect(verdict.after.findings).toEqual([]);
    expect(verdict.reason).toBeNull();
  });

  it("accepts an empty replacement, which is just a deletion", () => {
    const verdict = refereeEdit(DEMO, ONE, edit(ONE, ""));
    expect(verdict.accepted).toBe(true);
    expect(verdict.text).toBe("This is a  good idea.");
  });

  it("returns the text unchanged when it refuses", () => {
    const verdict = refereeEdit(DEMO, ONE, edit(ONE, "really"));
    expect(verdict.accepted).toBe(false);
    expect(verdict.text).toBe(ONE);
  });

  // --- condition 2: the replacement has to be clean -----------------------------------------

  it("refuses a replacement that carries its own tell", () => {
    const verdict = refereeEdit(DEMO, ONE, edit(ONE, "really"));
    expect(verdict.accepted).toBe(false);
    expect(verdict.reason).toContain("replacement text carries its own tell");
    expect(verdict.reason).toContain("demo/intensifier");
    expect(verdict.after?.findings).toHaveLength(1);
  });

  it("refuses a replacement that swaps one tell for two", () => {
    const verdict = refereeEdit(DEMO, ONE, edit(ONE, "really quite"));
    expect(verdict.accepted).toBe(false);
    expect(verdict.reason).toContain("carries its own tell");
  });

  it("refuses a replacement that merely re-spaces the same tell", () => {
    const text = "This is a very good idea.";
    const verdict = refereeEdit(DEMO, text, { findingId: target(text), replacement: " very" });
    expect(verdict.accepted).toBe(false);
    expect(verdict.reason).toContain("carries its own tell");
  });

  it("refuses a replacement identical to the text it replaces", () => {
    const verdict = refereeEdit(DEMO, ONE, edit(ONE, "very"));
    expect(verdict.accepted).toBe(false);
    expect(verdict.reason).toContain("identical to the text it replaces");
  });

  // --- condition 3: the rest of the document is untouched --------------------------------------

  it("carries the other findings across an edit that shortens the text", () => {
    const text = "It is really quite clever and very sharp.";
    expect(lint(text).findings).toHaveLength(3);
    const verdict = accepted(refereeEdit(DEMO, text, edit(text, ""))); // drop "really"
    expect(verdict.text).toBe("It is  quite clever and very sharp.");
    // The two survivors are the same two findings, shifted left.
    expect(verdict.after.findings.map((f) => verdict.text.slice(f.span.start, f.span.end))).toEqual(["quite", "very"]);
  });

  it("refuses an edit that plants a finding OUTSIDE its own region", () => {
    // The demo rule is purely local, so it cannot show this: an edit can only create an
    // intensifier inside the words it wrote. AFTER_COMMA can — it flags the word following a
    // comma, so a replacement that merely ENDS in a comma newly flags the untouched word after it.
    const text = "This is a very good idea.";
    const findings = runRules([AFTER_COMMA], makeDoc(text)).findings;
    expect(findings).toEqual([]); // nothing flagged to begin with...

    const seeded = "One, two and a very good idea.";
    const seed = runRules([AFTER_COMMA, demoIntensifierRule], makeDoc(seeded)).findings;
    const veryFinding = seed.find((f) => f.ruleId === "demo/intensifier")!;
    const verdict = refereeEdit([AFTER_COMMA, demoIntensifierRule], seeded, {
      findingId: idOf(veryFinding),
      replacement: "sharp,",
    });
    expect(verdict.accepted).toBe(false);
    expect(verdict.reason).toContain("disturbed the rest of the document");
    expect(verdict.reason).toContain("test/after-comma");
    expect(verdict.text).toBe(seeded);
  });

  // --- well-formedness -------------------------------------------------------------------------

  it("refuses an edit naming a finding the linter did not report", () => {
    const verdict = refereeEdit(DEMO, ONE, {
      findingId: { ruleId: "demo/intensifier", span: spanOf(ONE, "good") },
      replacement: "fine",
    });
    expect(verdict.accepted).toBe(false);
    expect(verdict.reason).toContain("no finding");
  });

  it("refuses a span that does not fit the document", () => {
    const verdict = refereeEdit(DEMO, ONE, {
      findingId: { ruleId: "demo/intensifier", span: { start: 0, end: 9999 } },
      replacement: "x",
    });
    expect(verdict.accepted).toBe(false);
    expect(verdict.reason).toContain("does not fit");
  });

  it("is pure: refereeing twice gives the same verdict and never mutates the input", () => {
    const text = ONE;
    const a = refereeEdit(DEMO, text, edit(text, "blistering"));
    const b = refereeEdit(DEMO, text, edit(text, "blistering"));
    expect(a.text).toBe(b.text);
    expect(a.accepted).toBe(b.accepted);
    expect(text).toBe(ONE);
  });
});

describe("refereeEdits", () => {
  it("keeps the accepted edits and steps over the refused ones", () => {
    const text = "It is really quite clever.";
    const findings = lint(text).findings;
    expect(findings).toHaveLength(2);

    // Judge the LATER finding first, so accepting it cannot move the earlier one's offsets.
    const run = refereeEdits(DEMO, text, [
      { findingId: idOf(findings[1]!), replacement: "" }, // "quite" -> gone: accepted
      { findingId: idOf(findings[0]!), replacement: "truly" }, // "really" -> another tell: refused
    ]);

    expect(run.steps.map((s) => s.accepted)).toEqual([true, false]);
    expect(run.steps[1]!.reason).toContain("carries its own tell");
    expect(run.text).toBe("It is really  clever.");
    expect(run.after.findings).toHaveLength(1);
  });

  it("is monotone: the finding count never rises across a run", () => {
    const text = "It is really quite clever and very sharp.";
    const findings = lint(text).findings;
    const run = refereeEdits(
      DEMO,
      text,
      [...findings].reverse().map((f) => ({ findingId: idOf(f), replacement: "" })),
    );
    expect(run.after.findings.length).toBeLessThan(run.before.findings.length);
    expect(run.after.findings).toEqual([]);
  });

  it("leaves a clean document alone", () => {
    const clean = "He walked to the store and bought bread.";
    const run = refereeEdits(DEMO, clean, []);
    expect(run.text).toBe(clean);
    expect(run.steps).toEqual([]);
  });
});

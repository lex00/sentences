import { describe, it, expect } from "vitest";
import { computeFixDiff } from "./diff.js";
import { splicesFor } from "../lint/fix/index.js";
import type { TextEdit } from "../lint/fix/index.js";

// Helper: build one "step" the way fixLoop would report it — the splices lowered from a batch of
// edits applied to `text` — so these tests exercise the exact shape computeFixDiff consumes.
const stepFor = (text: string, edits: TextEdit[]) => ({ splices: splicesFor(text, edits) });

describe("computeFixDiff", () => {
  it("is empty for zero steps", () => {
    expect(computeFixDiff("hello world", [])).toEqual({ removed: [], added: [] });
  });

  it("marks a plain delete as removed in the original text's coordinates", () => {
    const text = "This is a very good idea.";
    // "very " deleted, mirroring the demo intensifier fixer's shape
    const steps = [stepFor(text, [{ kind: "delete", span: { start: 10, end: 15 } }])];
    const diff = computeFixDiff(text, steps);
    expect(diff.removed).toEqual([{ start: 10, end: 15 }]);
    expect(diff.added).toEqual([]);
  });

  it("marks a repair's replacement as added in the final text's coordinates", () => {
    // "Very good." -> delete "Very " (unit-starting word takes the space AFTER instead) then
    // capitalize "g" -> "G": final text is "Good.".
    const text = "Very good.";
    const edits: TextEdit[] = [
      { kind: "delete", span: { start: 0, end: 4 } },
      { kind: "repair", span: { start: 4, end: 5 }, replacement: "" }, // drop the space after "Very"
      { kind: "repair", span: { start: 5, end: 6 }, replacement: "G" }, // capitalize "good" -> "Good"
    ];
    const steps = [stepFor(text, edits)];
    const diff = computeFixDiff(text, steps);
    const final = "Good.";
    expect(final[diff.added[0]!.start]).toBe("G");
    expect(diff.added).toEqual([{ start: 0, end: 1 }]);
    // every original character except the capital-carrying "g" (now recapitalized, so it has no
    // surviving origin either) was either deleted outright or replaced by the repair
    expect(diff.removed).toEqual([{ start: 0, end: 6 }]);
  });

  it("composes two steps in sequence, remaining correct against the true final text", () => {
    const text = "This is a very very good idea.";
    // step 1 removes the first "very ", step 2 (against the resulting text) removes the second
    const afterStep1 = text.slice(0, 10) + text.slice(15); // "This is a very good idea."
    const steps = [
      stepFor(text, [{ kind: "delete", span: { start: 10, end: 15 } }]),
      stepFor(afterStep1, [{ kind: "delete", span: { start: 10, end: 15 } }]),
    ];
    const diff = computeFixDiff(text, steps);
    expect(diff.added).toEqual([]);
    // both "very " occurrences removed from the original: [10,15) and, in original coordinates,
    // the second one sits right after the first was cut, i.e. originally [15,20)
    expect(diff.removed).toEqual([{ start: 10, end: 20 }]);
  });

  it("leaves everything alone when there are no edits in the step", () => {
    const text = "Nothing to see here.";
    const diff = computeFixDiff(text, [{ splices: [] }]);
    expect(diff).toEqual({ removed: [], added: [] });
  });
});

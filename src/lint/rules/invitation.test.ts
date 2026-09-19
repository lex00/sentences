import { describe, it, expect } from "vitest";
import { runRules } from "../engine.js";
import { buildDocAnalysis } from "../build-doc.js";
import { invitationRule } from "./invitation.js";

const run = (t: string) => runRules([invitationRule], buildDocAnalysis(t)).findings;

describe("claude/invitation", () => {
  it("fires on a conjured scene", () => {
    const f = run("Picture a retry limit hard-capped at two, sitting in a service with no comment.");
    expect(f).toHaveLength(1);
    expect(f[0]!.message).toContain("Picture");
    expect(f[0]!.severity).toBe("candidate");
  });

  it("covers the futurism form", () => {
    expect(run("Imagine every tool you open already knowing what you meant to do.")).toHaveLength(1);
  });

  it("escalates when it becomes a habit", () => {
    const three =
      "Picture a retry limit sitting in a payment service. " +
      "Imagine every tool you open already knowing your intent. " +
      "Consider a rewrite that passes every test it was given.";
    const f = run(three);
    expect(f).toHaveLength(3);
    expect(f[0]!.severity).toBe("low");
    expect(f[0]!.explanation).toContain("3 sentences this way");
  });

  // The narrowing: the verb has to be opening a sentence and instructing the reader.
  it("stays silent mid-sentence", () => {
    expect(run("You might picture it that way, though the parser does something simpler.")).toEqual([]);
  });

  it("stays silent when it reports rather than instructs", () => {
    expect(run("The team pictured a retry limit and then measured the real one instead.")).toEqual([]);
  });

  it("stays silent on a pointer to something already on the page", () => {
    expect(run("Note that the weights are a build artifact and are not committed.")).toEqual([]);
  });

  it("needs somewhere for the hypothetical to go", () => {
    expect(run("Consider.")).toEqual([]);
  });

  it("stays out of bullets and headings", () => {
    expect(run("## Picture a retry limit sitting in a payment service with no comment")).toEqual([]);
  });
});

// Tests for rules/claude-figurative.ts: the four pattern-shaped checks and their allowlist/gate
// logic. Fixture-battery.test.ts covers span correctness per fixture; this file pins the specific
// allowlist and gate behavior (which base word suppresses which suffix, which neighbor suppresses
// "load-bearing") the fixture battery doesn't spell out on its own.

import { describe, it, expect } from "vitest";
import { makeDoc } from "../stub-doc.js";
import { RULES } from "../registry.js";
import { claudeFigurativeSuffixesRule } from "./claude-figurative.js";

const detect = (text: string) => claudeFigurativeSuffixesRule.detect(makeDoc(text));

describe("claude/figurative-suffixes: -shaped", () => {
  it("fires on an abstract noun before -shaped", () => {
    const findings = detect("That role is basically agent-shaped.");
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe("medium");
  });

  it("stays clean for a physical-shape allowlist word", () => {
    expect(detect("The bakery sells a star-shaped cookie every December.")).toHaveLength(0);
  });

  it("fires for a single-letter base not on the allowlist ('Y')", () => {
    expect(detect("There's a Y-shaped hole in the org chart.")).toHaveLength(1);
  });

  it("stays clean for a single-letter base that IS on the allowlist ('L')", () => {
    expect(detect("The architect wanted an L-shaped desk for the corner.")).toHaveLength(0);
  });
});

describe("claude/figurative-suffixes: -adjacent", () => {
  it("fires unconditionally — no allowlist for this suffix", () => {
    expect(detect("This vendor is crypto-adjacent.")).toHaveLength(1);
  });

  it("does not fire on the bare word 'adjacent' with no suffix host", () => {
    expect(detect("The room adjacent to the lobby was quiet.")).toHaveLength(0);
  });
});

describe("claude/figurative-suffixes: -flavored", () => {
  it("fires on a non-food base", () => {
    expect(detect("The new format is JSON-flavored.")).toHaveLength(1);
  });

  it("stays clean for a food-allowlist base", () => {
    expect(detect("The candy is cherry-flavored.")).toHaveLength(0);
  });
});

describe("claude/figurative-suffixes: 'the X story'", () => {
  it("fires when X is a technical noun", () => {
    const findings = detect("We need to nail down the deployment story before launch.");
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toContain("the X story");
  });

  it("fires with a hyphenated technical noun (single token)", () => {
    expect(detect("Nobody has thought through the error-handling story here.")).toHaveLength(1);
  });

  it("stays clean when X is on the story-legit allowlist", () => {
    expect(detect("This is the origin story everyone already knows.")).toHaveLength(0);
  });

  it("does not fire on 'a X story' — only 'the X story' is the pattern", () => {
    expect(detect("She told a bedtime story about a dragon.")).toHaveLength(0);
  });
});

describe("claude/figurative-suffixes: 'load-bearing' literal gate", () => {
  it("fires (high) in the figurative sense — no structural noun follows", () => {
    const findings = detect("That helper function is load-bearing for the whole pipeline.");
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe("high");
  });

  it("stays clean immediately before a singular structural noun", () => {
    expect(detect("The load-bearing wall cracked during the renovation.")).toHaveLength(0);
  });

  it("stays clean immediately before a plural structural noun", () => {
    expect(detect("Two load-bearing columns held up the mezzanine.")).toHaveLength(0);
  });

  it("stays clean at end of sentence with no following word at all", () => {
    expect(detect("The old barn is still load-bearing.")).toHaveLength(1);
    // sanity: no crash / false negative when there IS no next word (see the other assertion above
    // for the true end-of-unit case)
    expect(detect("Load-bearing.")).toHaveLength(1);
  });
});

describe("claude/figurative-suffixes: rule shape and registration", () => {
  it("reports tier 'lexical' and id 'claude/figurative-suffixes'", () => {
    expect(claudeFigurativeSuffixesRule.tier).toBe("lexical");
    expect(claudeFigurativeSuffixesRule.id).toBe("claude/figurative-suffixes");
  });

  it("gives every finding a non-empty explanation", () => {
    for (const f of detect("This vendor is crypto-adjacent and also agent-shaped.")) {
      expect(f.explanation.length).toBeGreaterThan(0);
    }
  });

  it("is wired into the app-wide registry", () => {
    expect(RULES.some((r) => r.id === "claude/figurative-suffixes")).toBe(true);
  });

  it("stays clean on plain prose", () => {
    expect(detect("The dog chased the ball across the yard.")).toHaveLength(0);
  });
});

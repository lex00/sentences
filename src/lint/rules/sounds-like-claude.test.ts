// Behavior + hygiene for rules/sounds-like-claude.ts (issue #34's capstone). The fixture battery
// (fixtures/claude-sounds-like-claude.ts) already covers the basic fire/stay-silent shape; this
// file covers the exact threshold boundary and the id-set hygiene check the rule file's header
// promises (CLAUDE_FAMILIES must track every registered "claude"-prefixed rule id exactly).
import { describe, it, expect } from "vitest";
import { makeDoc } from "../stub-doc.js";
import { RULES } from "../registry.js";
import { soundsLikeClaudeRule, CLAUDE_FAMILY_IDS } from "./sounds-like-claude.js";

describe("claude/sounds-like-claude: id-set hygiene", () => {
  it("CLAUDE_FAMILY_IDS tracks every registered rule id starting with \"claude\", except itself", () => {
    const registryClaudeIds = new Set(
      RULES.map((r) => r.id).filter((id) => id.startsWith("claude") && id !== soundsLikeClaudeRule.id),
    );
    expect(CLAUDE_FAMILY_IDS).toEqual(registryClaudeIds);
  });
});

describe("claude/sounds-like-claude: co-occurrence threshold", () => {
  const THREE_FAMILIES = [
    "Our retry logic is a footgun waiting to happen.",
    "Feel free to disable it if that's simpler.",
    "At a high level, the system retries before failing over.",
  ].join(" ");

  const FOUR_FAMILIES = [
    "Our retry logic is a footgun waiting to happen.",
    "Feel free to disable it if that's simpler.",
    "At a high level, the system retries before failing over.",
    "When the outage hit, something else entirely broke downstream.",
  ].join(" ");

  it("stays silent at exactly 3 distinct families", () => {
    const doc = makeDoc(THREE_FAMILIES);
    expect(soundsLikeClaudeRule.detect(doc)).toHaveLength(0);
  });

  it("fires exactly one high-severity, document-spanning finding at 4 distinct families", () => {
    const doc = makeDoc(FOUR_FAMILIES);
    const findings = soundsLikeClaudeRule.detect(doc);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe("high");
    expect(findings[0]!.span).toEqual({ start: 0, end: doc.text.length });
  });

  it("the family rules' own findings still appear separately alongside the capstone", () => {
    const doc = makeDoc(FOUR_FAMILIES);
    expect(soundsLikeClaudeRule.detect(doc)).toHaveLength(1);
    // Spot-check one family: claude-assistant-voice still reports "feel free to" on its own.
    const family = RULES.find((r) => r.id === "claude-assistant-voice")!;
    expect(family.detect(doc).length).toBeGreaterThan(0);
  });

  // Deliberately NOT in fixtures/claude-sounds-like-claude.ts — see that file's header note: this
  // text is dense enough in one family that claude-technical-vocabulary's OWN rule correctly fires
  // on it several times, which the shared fixture battery's cross-rule check would reject as a
  // "negative" (it requires every rule to stay silent, not just this one). Calling detect()
  // directly here checks exactly what this rule promises: co-occurrence needs DISTINCT families,
  // not raw hit count.
  it("stays silent when many hits all come from the SAME family", () => {
    const doc = makeDoc(
      [
        "This is a battle-tested footgun.",
        "The happy path avoids the blast radius.",
        "Table stakes here is a north star for engineering culture.",
        "A single source of truth keeps cognitive load down with a solid mental model.",
      ].join(" "),
    );
    expect(soundsLikeClaudeRule.detect(doc)).toHaveLength(0);
  });
});

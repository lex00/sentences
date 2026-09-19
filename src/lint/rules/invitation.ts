// THE INVITATION — "Picture a retry limit, hard-capped at two, sitting in a payment service."
//
// The reader is asked to imagine a scene, and the scene is built to make the argument that follows
// feel like something they worked out themselves. CLAUDE.md names it ("Imagine a world where...")
// and nothing implemented it.
//
// What makes it a tell is not the invitation itself. A concrete example is good writing, and
// "suppose the input is empty" is how anyone explains an edge case. It is the invitation used as a
// SENTENCE OPENER to launch a hypothetical the reader did not ask for, where the writer could have
// simply stated the case.
//
// MEASURED at 0.50 per 1000 words across a 39,793-word corpus of this register and 0.00 across
// this repository's own documentation. A clean separation on a modest volume, which is the reason
// it reports at "candidate" for a single instance: the separation is real but twenty occurrences
// in forty thousand words is not enough evidence to call any one of them a defect.
//
// "Consider" is the risky member of the set and stays in, because it did not appear once in the
// baseline. "Note that" and "Remember" are deliberately out: they point at something already on
// the page rather than conjuring something new.

import type { DocAnalysis, Finding, Severity, TropeRule } from "../types.js";
import type { Strictness } from "../strictness.js";
import { DEFAULT_STRICTNESS, severityAt } from "../strictness.js";
import { inKind, markdownContext } from "../markdown.js";

const RULE_ID = "claude/invitation";

// Sentence-initial only. "You might picture it that way" is not this.
const INVITE = /^(?:picture|imagine|envision|suppose|consider|think\s+about)\b/i;

// The hypothetical needs somewhere to go. A bare "Consider." is not an invitation to anything, and
// a very long one has stopped being a framing device and become the explanation itself.
const MIN_WORDS = 5;
const MAX_WORDS = 45;

const SUPPRESSED = ["heading", "bullet", "codeFence", "blockquote"] as const;

const severityFor = (count: number): Severity => (count >= 3 ? "low" : "candidate");

export const invitationRule: TropeRule = {
  id: RULE_ID,
  name: "The invitation (asking the reader to picture it)",
  tier: "lexical",
  detect(doc: DocAnalysis, strictness: Strictness = DEFAULT_STRICTNESS): Finding[] {
    const ctx = markdownContext(doc.text);
    const hits = doc.units.filter((u) => {
      if (SUPPRESSED.some((k) => inKind(ctx, u.span, k))) return false;
      const words = u.words.filter((w) => /[\p{L}\p{N}]/u.test(w.text)).length;
      if (words < MIN_WORDS || words > MAX_WORDS) return false;
      return INVITE.test(u.unit.trim());
    });
    if (hits.length === 0) return [];

    const severity = severityAt(severityFor(hits.length), strictness);
    const density =
      hits.length >= 3
        ? ` This piece opens ${hits.length} sentences this way, which is a habit rather than a device.`
        : "";

    return hits.map((u) => {
      const opener = u.unit.trim().split(/\s+/)[0]!.replace(/[^\p{L}]/gu, "");
      return {
        ruleId: RULE_ID,
        span: u.span,
        severity,
        message: `invites the reader to imagine: “${opener} …”`,
        explanation:
          `This asks the reader to picture a scene before making the point, and the scene is built so the ` +
          `conclusion arrives feeling like something they worked out themselves. A concrete example earns its ` +
          `place; a hypothetical the reader did not ask for is the writer borrowing their agreement in advance. ` +
          `State the case instead, or use a real one you can name.` +
          density,
      };
    });
  },
};

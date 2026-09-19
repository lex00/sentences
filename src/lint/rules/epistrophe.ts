// EPISTROPHE — the repeated sentence ENDING. Anaphora's mirror image, and the one nobody was
// watching:
//
//   "But the reason is gone. The regulatory requirement that created the rule is gone. The
//    rejected alternatives are gone. The payment processor constraint that made the ugly version
//    necessary is gone."
//
// Four sentences landing on the same two words. rules/anaphora.ts catches a run of repeated
// OPENINGS and has no counterpart for this, so a passage built entirely on the figure scored zero.
// Found by running the linter over a chapter of published technical prose that reads as generated.
//
// Why it is worth a rule of its own rather than a widening of anaphora. An opening repeats because
// a writer started three sentences the same way, which is often just momentum. An ending repeats
// because the writer drove three different sentences toward the same landing, which takes
// arranging, and the reader hears it as a drumbeat. The figure is rarer in ordinary prose and
// louder when it appears, so it wants its own threshold and its own explanation.
//
// --- the key ---
// The last TAIL_WORDS words of a unit, lowercased, punctuation stripped. Two words rather than one
// because one is too easy to hit by accident — English sentences end on "it", "them" and "that"
// constantly, and a rule keyed on a single closing word would report every third paragraph. Two
// consecutive words repeating across sentences is already deliberate.
//
// A unit has to be LONGER than the key, not merely as long. "It is. It is. It is." is three
// sentences that are entirely their own ending, which is a repeated sentence rather than a repeated
// landing — rules/repetition.ts owns that. Epistrophe needs different sentences arriving at the
// same close, so the sentence has to have something else in it.

import type { DocAnalysis, Finding, Severity, TropeRule, UnitAnalysis } from "../types.js";
import type { Strictness } from "../strictness.js";
import { DEFAULT_STRICTNESS, floorAt, severityAt } from "../strictness.js";
import { inKind, markdownContext } from "../markdown.js";
import { spanning } from "../span.js";

const RULE_ID = "discourse/epistrophe";

const TAIL_WORDS = 2;
const WINDOW = 5; // consecutive-unit window, same as anaphora's: a run has to be a run
const MIN_RUN = 3; // a density floor, and it moves with the dial
const HIGH_AT = 4; // past this the figure is the passage's whole rhythm
const SUPPRESSED = ["heading", "bullet", "codeFence", "blockquote"] as const;

const words = (text: string): string[] =>
  text.toLowerCase().match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) ?? [];

// The unit's closing TAIL_WORDS words, or null when it has fewer than that.
function endingKey(unit: UnitAnalysis): string | null {
  const w = words(unit.unit);
  return w.length <= TAIL_WORDS ? null : w.slice(-TAIL_WORDS).join(" ");
}

export const epistropheRule: TropeRule = {
  id: RULE_ID,
  name: "Epistrophe (repeated sentence endings)",
  tier: "discourse",
  detect(doc: DocAnalysis, strictness: Strictness = DEFAULT_STRICTNESS): Finding[] {
    const ctx = markdownContext(doc.text);
    const keys = doc.units.map((u) =>
      SUPPRESSED.some((k) => inKind(ctx, u.span, k)) ? null : endingKey(u),
    );

    const findings: Finding[] = [];
    const claimed = new Set<number>();

    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      if (!k || claimed.has(i)) continue;

      const members = [i];
      let last = i;
      for (let j = i + 1; j < keys.length && j - last < WINDOW; j++) {
        if (keys[j] === k) {
          members.push(j);
          last = j;
        }
      }

      if (members.length < Math.max(2, floorAt(MIN_RUN, strictness))) continue;
      for (const m of members) claimed.add(m); // one finding per run, not one per sentence

      const count = members.length;
      const base: Severity = count >= HIGH_AT ? "high" : "medium";
      findings.push({
        ruleId: RULE_ID,
        span: spanning([doc.units[members[0]!]!, doc.units[members[members.length - 1]!]!]),
        severity: severityAt(base, strictness),
        message: `${count} sentences in a row end on “${k}” — epistrophe`,
        explanation:
          `${count} consecutive sentences land on the same two words, “${k}”. Where a repeated opening ` +
          `is often just momentum, a repeated ending has to be arranged: three different sentences were ` +
          `steered toward the same close. The reader hears the drumbeat and stops hearing the sentences, ` +
          `which is the opposite of what the repetition was meant to do. Keep the one that lands hardest ` +
          `and let the others end where they naturally would.`,
      });
    }

    return findings;
  },
};

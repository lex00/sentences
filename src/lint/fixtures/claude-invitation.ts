// Fixtures for claude/invitation — the reader asked to picture a scene before the point is made.

import type { RuleFixtures } from "./types.js";

export const fixtures: RuleFixtures = {
  ruleId: "claude/invitation",
  positives: [
    {
      text: "Picture a retry limit hard-capped at two, sitting in a service with no comment explaining it.",
      spanText: "Picture a retry limit hard-capped at two, sitting in a service with no comment explaining it.",
      note: "a hypothetical scene conjured to carry the argument that follows",
    },
    {
      text: "Imagine every tool you open already knowing what you meant to do with it.",
      spanText: "Imagine every tool you open already knowing what you meant to do with it.",
      note: "the futurism form of the same move",
    },
  ],
  negatives: [
    {
      text: "You might picture it that way, though the parser does something simpler.",
      note: "not sentence-initial: the verb is doing ordinary work mid-clause",
    },
    {
      text: "Consider.",
      note: "nowhere for a hypothetical to go; below the word floor",
    },
    {
      text: "Note that the weights are a build artifact and are not committed to the repository.",
      note: "points at something already on the page rather than conjuring something new",
    },
    {
      text: "The team pictured a retry limit and then went and measured the real one instead.",
      note: "the same verb, reporting what someone did rather than instructing the reader",
    },
  ],
};

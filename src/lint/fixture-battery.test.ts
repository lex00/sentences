// The per-rule fixture battery (issue #12). Trope rules rot silently without this: a rule ships,
// its wording drifts as the epic grows, and nobody notices it stopped firing (or started firing on
// prose it shouldn't) until a person eyeballs the output. This file is what turns that into a CI
// failure instead.
//
// What it checks, for every registered rule:
//   1. a fixture file exists for it at all (missing fixtures fail loudly, by rule id — this is the
//      forcing function that catches a rule landing without a fixture file)
//   2. every fixture file's ruleId points at a rule that actually exists (catches a typo or a rule
//      that got renamed out from under its fixtures)
//   3. every POSITIVE fires: the rule's own detect() must return a finding whose span is EXACTLY
//      (see "span matching" below) the substring the fixture names
//   4. every NEGATIVE stays silent: the rule must not report itself on its own near-miss fixtures
//   5. cross-rule precision: the rule must not report itself on any OTHER rule's negatives either —
//      a negative is a near-miss for the trope it was written against, but it is prose, and no
//      unrelated rule should be tripping on it
//   6. profile: a "shape" fixture (the default) must hold at EVERY strictness level, because the
//      dial moves counts and severities and never what counts as the shape; a "rate" fixture makes
//      a claim about a density threshold and is checked at the default level only. See
//      fixtures/types.ts. Cross-rule precision (5) stays at the default level throughout: it is a
//      statement about the calibrated rule set, and level 3 is deliberately noisy, so firing there
//      is the dial working rather than a precision failure.
//
// Fixture discovery: every *.ts file in ./fixtures/ except types.ts is a fixture module (see
// fixtures/types.ts for the shape) and is picked up automatically — dropping a new file in that
// directory is enough, no registration list to edit and nothing here to touch.
//
// Span matching is EXACT, not containment: a fixture's `spanText` (at its `nth` occurrence, default
// 1) is resolved to a Span via stub-doc's spanOf, and the rule's finding must slice to precisely
// that Span. A rule that reports the whole clause when the fixture names one word is a fixture bug
// or a rule bug — either way, loosening this to "the finding contains the substring" would hide a
// rule reporting a much wider span than the tell actually is, which is exactly the kind of drift
// this battery exists to catch. If a real rule needs a wider span (e.g. the whole "It's not X — but
// Y" clause), write spanText as that whole substring; it is still one exact string to match.
//
// Analysis path: fixtures are plain text. By default they run through stub-doc's makeDoc — no
// parser, honest offsets, every unit "unparseable". A fixture that needs real clauses to test a
// syntactic rule sets needsClauses: true, which routes it through build-doc.ts's buildDocAnalysis
// instead (readDocument, real rule-based parse, plus word spans scanned the same way stub-doc does
// it — buildDocAnalysis is the app's own product-code seam for exactly this, not a reimplementation
// grown here). See fixtures/types.ts's FORMAT EXTENSION comment for `posOverrides`, the one other
// knob this harness offers on top of plain text.

import { describe, expect, it } from "vitest";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { RULES } from "./registry.js";
import { makeDoc, spanOf } from "./stub-doc.js";
import { sameSpan, textAt } from "./span.js";
import { buildDocAnalysis } from "./build-doc.js";
import type { DocAnalysis, Finding, Span } from "./types.js";
import type { FixtureProfile, NegativeFixture, PositiveFixture, PosOverrides, RuleFixtures } from "./fixtures/types.js";
import type { Strictness } from "./strictness.js";
import { DEFAULT_STRICTNESS, STRICTNESS_LEVELS } from "./strictness.js";

// --- discovery ---

const FIXTURES_DIR = fileURLToPath(new URL("./fixtures/", import.meta.url));

const fixtureFiles = readdirSync(FIXTURES_DIR)
  .filter((f) => f.endsWith(".ts") && f !== "types.ts" && !f.endsWith(".test.ts"))
  .sort(); // deterministic run order, independent of the OS's directory listing order

const fixtureSets: RuleFixtures[] = await Promise.all(
  fixtureFiles.map(async (file) => {
    const base = file.slice(0, -".ts".length); // keep the ".ts" static for Vite's import-vars plugin
    const mod: { fixtures?: RuleFixtures } = await import(`./fixtures/${base}.ts`);
    if (!mod.fixtures) {
      throw new Error(`src/lint/fixtures/${file} does not export "fixtures" (see fixtures/types.ts)`);
    }
    return mod.fixtures;
  }),
);

const fixturesByRuleId = new Map(fixtureSets.map((f) => [f.ruleId, f]));

// --- doc building ---

// Patches word.pos in place for every word whose text matches a posOverrides key (case-insensitive
// on the surface token — a fixture writes "leverage", not "Leverage"). See fixtures/types.ts.
function applyPosOverrides(doc: DocAnalysis, overrides: PosOverrides | undefined): DocAnalysis {
  if (!overrides) return doc;
  const byLower = new Map(Object.entries(overrides).map(([k, v]) => [k.toLowerCase(), v]));
  for (const unit of doc.units) {
    for (const w of unit.words) {
      const pos = byLower.get(w.text.toLowerCase());
      if (pos !== undefined) w.pos = pos;
    }
  }
  return doc;
}

function buildDoc(f: { text: string; needsClauses?: boolean; posOverrides?: PosOverrides }): DocAnalysis {
  const doc = f.needsClauses ? buildDocAnalysis(f.text) : makeDoc(f.text);
  return applyPosOverrides(doc, f.posOverrides);
}

// The levels a fixture's claim is asserted over. A shape fixture is checked at all three; a rate
// fixture only where its threshold was calibrated.
const levelsFor = (profile: FixtureProfile | undefined): readonly Strictness[] =>
  (profile ?? "shape") === "rate" ? [DEFAULT_STRICTNESS] : STRICTNESS_LEVELS;

// Names the level in a failure message only when there is more than one in play, so a rate
// fixture's output reads exactly as it did before profiles existed.
const atLevel = (levels: readonly Strictness[], s: Strictness): string =>
  levels.length > 1 ? ` at strictness ${s}` : "";

// --- failure formatting ---
// Every thrown message below names the rule id and the fixture (by index and note/text) plus
// expected vs. actual, per the issue's acceptance criteria — this is the whole point of the file.

const describeFinding = (text: string, f: Finding): string =>
  `${f.ruleId} @ [${f.span.start},${f.span.end}) ${JSON.stringify(textAt(text, f.span))}`;

const actualList = (text: string, findings: readonly Finding[]): string =>
  findings.length === 0 ? "(no findings)" : findings.map((f) => describeFinding(text, f)).join("; ");

// --- the battery ---

describe("lint fixture battery (#12)", () => {
  it("every registered rule has a fixture file in src/lint/fixtures/", () => {
    const missing = RULES.map((r) => r.id).filter((id) => !fixturesByRuleId.has(id));
    expect(
      missing,
      missing.length === 0
        ? undefined
        : `missing fixture file(s) for rule id(s): ${missing.join(", ")} — add src/lint/fixtures/<id-with-slashes-as-dashes>.ts exporting { fixtures } (see fixtures/types.ts and fixtures/demo-intensifier.ts)`,
    ).toEqual([]);
  });

  it("every fixture file's ruleId matches a registered rule", () => {
    const known = new Set(RULES.map((r) => r.id));
    const unknown = fixtureSets.filter((f) => !known.has(f.ruleId)).map((f) => f.ruleId);
    expect(
      unknown,
      unknown.length === 0
        ? undefined
        : `fixture file(s) reference rule id(s) not in the registry: ${unknown.join(", ")} — typo, or a rule that was renamed/removed without updating its fixtures`,
    ).toEqual([]);
  });

  for (const rule of RULES) {
    const fx = fixturesByRuleId.get(rule.id);
    if (!fx) continue; // already reported above; don't cascade into a wall of confusing failures

    describe(rule.id, () => {
      fx.positives.forEach((pos: PositiveFixture, i: number) => {
        const levels = levelsFor(pos.profile);
        for (const level of levels) {
          it(`fires on positive #${i + 1}${atLevel(levels, level)} (${pos.note ?? JSON.stringify(pos.spanText)})`, () => {
            const doc = buildDoc(pos);
            const findings = rule.detect(doc, level);
            const expected: Span = spanOf(pos.text, pos.spanText, pos.nth ?? 1);
            const hit = findings.find((f) => f.ruleId === rule.id && sameSpan(f.span, expected));
            expect(
              hit,
              hit
                ? undefined
                : `${rule.id} fixture positive #${i + 1}${atLevel(levels, level)}\n` +
                    `  text:     ${JSON.stringify(pos.text)}\n` +
                    `  expected: span [${expected.start},${expected.end}) = ${JSON.stringify(pos.spanText)} (occurrence ${pos.nth ?? 1})\n` +
                    `  actual:   ${actualList(pos.text, findings)}\n` +
                    (levels.length > 1
                      ? `  note:     this is a "shape" fixture, so it must hold at every strictness level. If its claim is about a DENSITY THRESHOLD rather than a structure, mark it profile: "rate" (see fixtures/types.ts).`
                      : ""),
            ).toBeDefined();
          });
        }
      });

      fx.negatives.forEach((neg: NegativeFixture, i: number) => {
        const levels = levelsFor(neg.profile);
        for (const level of levels) {
          it(`stays silent on negative #${i + 1}${atLevel(levels, level)} (${neg.note ?? "no note"})`, () => {
            const doc = buildDoc(neg);
            const hits = rule.detect(doc, level).filter((f) => f.ruleId === rule.id);
            expect(
              hits,
              hits.length === 0
                ? undefined
                : `${rule.id} fixture negative #${i + 1}${atLevel(levels, level)}\n` +
                    `  text:     ${JSON.stringify(neg.text)}\n` +
                    `  expected: no findings from ${rule.id}\n` +
                    `  actual:   ${actualList(neg.text, hits)}\n` +
                    (levels.length > 1
                      ? `  note:     this is a "shape" fixture, so it must hold at every strictness level. A rule that stays silent at 2 and fires at 3 on the same text is either letting the dial into its structural narrowing — which strictness.ts forbids — or making a threshold claim that belongs behind profile: "rate".`
                      : ""),
            ).toEqual([]);
          });
        }
      });
    });
  }

  // A "rate" label costs the battery two thirds of its coverage for that fixture, so it has to be
  // earned. A fixture marked "rate" whose behavior is identical at all three levels is a shape
  // fixture wearing a rate label — nothing about it is a threshold claim, and the annotation is
  // only narrowing what CI checks. This catches that, in the one direction the default cannot.
  describe("profile hygiene", () => {
    const rateFixtures = fixtureSets.flatMap((fx) => {
      const rule = RULES.find((r) => r.id === fx.ruleId);
      if (!rule) return [];
      return [
        ...fx.positives.map((f, i) => ({ rule, f, kind: "positive" as const, i })),
        ...fx.negatives.map((f, i) => ({ rule, f, kind: "negative" as const, i })),
      ].filter(({ f }) => f.profile === "rate");
    });

    if (rateFixtures.length === 0) {
      it("no fixture claims the rate profile yet", () => {
        expect(rateFixtures).toEqual([]);
      });
    } else {
      for (const { rule, f, kind, i } of rateFixtures) {
        it(`${rule.id}'s ${kind} #${i + 1} earns its "rate" profile`, () => {
          const doc = buildDoc(f);
          const counts = STRICTNESS_LEVELS.map((s) => rule.detect(doc, s).filter((x) => x.ruleId === rule.id).length);
          const identical = counts.every((n) => n === counts[0]);
          expect(
            identical,
            identical
              ? `${rule.id} ${kind} #${i + 1} is marked profile: "rate" but reports ${counts[0]} finding(s) at every ` +
                  `strictness level (${counts.join("/")}). Nothing about it is a threshold claim — drop the profile ` +
                  `and let it be checked at all three levels as a shape fixture.`
              : undefined,
          ).toBe(false);
        });
      }
    }
  });

  describe("cross-rule precision", () => {
    // Every (rule, other rule's negative) pair, skipping a rule's own fixtures — those are covered
    // above. Flattened up front so we can tell "genuinely nothing to check yet" (one rule total,
    // early in the epic) apart from a suite vitest would otherwise report as empty.
    const pairs = RULES.flatMap((rule) =>
      fixtureSets
        .filter((other) => other.ruleId !== rule.id)
        .flatMap((other) => other.negatives.map((neg, i) => ({ rule, other, neg, i }))),
    );

    if (pairs.length === 0) {
      it("nothing to cross-check yet — fewer than two rules have fixtures", () => {
        expect(fixtureSets.length).toBeLessThan(2);
      });
    } else {
      for (const { rule, other, neg, i } of pairs) {
        it(`${rule.id} stays silent on ${other.ruleId}'s negative #${i + 1}`, () => {
          const doc = buildDoc(neg);
          const hits = rule.detect(doc).filter((f) => f.ruleId === rule.id);
          expect(
            hits,
            hits.length === 0
              ? undefined
              : `cross-rule precision: ${rule.id} fired on ${other.ruleId}'s negative #${i + 1} (${neg.note ?? "no note"})\n` +
                  `  text:     ${JSON.stringify(neg.text)}\n` +
                  `  expected: no findings from ${rule.id}\n` +
                  `  actual:   ${actualList(neg.text, hits)}`,
          ).toEqual([]);
        });
      }
    }
  });
});

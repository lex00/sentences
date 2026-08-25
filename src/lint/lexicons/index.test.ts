// Data hygiene for the lexical tier (issue #20). No rule behavior is tested here — that's wave-2's
// job once the TropeRules exist. This just asserts the shape invariants LexiconEntry/Lexicon
// promise: unique ids, no empty entries, lowercase multi-word phrases, and posGate values that all
// map to a documented PTB prefix.
import { describe, it, expect } from "vitest";
import { LEXICONS, POS_GATE_PREFIX, type PosGate } from "./index.js";

const SEVERITIES = new Set(["candidate", "low", "medium", "high"]);
const POS_GATES = new Set(Object.keys(POS_GATE_PREFIX));

describe("lexicon data hygiene", () => {
  it("has at least one lexicon", () => {
    expect(LEXICONS.length).toBeGreaterThan(0);
  });

  it("has unique, non-empty ids", () => {
    const ids = LEXICONS.map((l) => l.id);
    expect(ids.every((id) => id.length > 0)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has unique, non-empty names", () => {
    const names = LEXICONS.map((l) => l.name);
    expect(names.every((n) => n.length > 0)).toBe(true);
    expect(new Set(names).size).toBe(names.length);
  });

  it("gives every lexicon a valid defaultSeverity and at least one entry", () => {
    for (const lex of LEXICONS) {
      expect(SEVERITIES.has(lex.defaultSeverity), `${lex.id}: bad defaultSeverity`).toBe(true);
      expect(lex.entries.length, `${lex.id}: no entries`).toBeGreaterThan(0);
    }
  });

  it("gives every lexicon a positive integer densityThreshold when present", () => {
    for (const lex of LEXICONS) {
      if (lex.densityThreshold === undefined) continue;
      expect(Number.isInteger(lex.densityThreshold), `${lex.id}: densityThreshold not an integer`).toBe(true);
      expect(lex.densityThreshold, `${lex.id}: densityThreshold not positive`).toBeGreaterThan(0);
    }
  });

  it("has no empty single-word or multi-word entries, all lowercase", () => {
    for (const lex of LEXICONS) {
      for (const entry of lex.entries) {
        const tokens = Array.isArray(entry.match) ? entry.match : [entry.match];
        expect(tokens.length, `${lex.id}: entry with zero tokens`).toBeGreaterThan(0);
        for (const tok of tokens) {
          expect(tok.length, `${lex.id}: empty token in ${JSON.stringify(entry.match)}`).toBeGreaterThan(0);
          expect(tok, `${lex.id}: token "${tok}" is not lowercase`).toBe(tok.toLowerCase());
          expect(tok, `${lex.id}: token "${tok}" has leading/trailing whitespace`).toBe(tok.trim());
        }
      }
    }
  });

  it("only uses posGate on single-word entries", () => {
    for (const lex of LEXICONS) {
      for (const entry of lex.entries) {
        if (entry.posGate === undefined) continue;
        expect(Array.isArray(entry.match), `${lex.id}: posGate on a multi-word entry`).toBe(false);
      }
    }
  });

  it("uses only posGate values documented in POS_GATE_PREFIX", () => {
    for (const lex of LEXICONS) {
      for (const entry of lex.entries) {
        if (entry.posGate === undefined) continue;
        expect(POS_GATES.has(entry.posGate), `${lex.id}: undocumented posGate "${entry.posGate}"`).toBe(true);
      }
    }
  });

  it("maps every documented posGate to a 2-letter uppercase PTB prefix", () => {
    const gates = Object.keys(POS_GATE_PREFIX) as PosGate[];
    expect(gates.length).toBeGreaterThan(0);
    for (const gate of gates) {
      const prefix = POS_GATE_PREFIX[gate];
      expect(prefix, `${gate}: prefix not 2 uppercase letters`).toMatch(/^[A-Z]{2}$/);
    }
  });

  it("gives every entry's severity override (when present) a valid Severity", () => {
    for (const lex of LEXICONS) {
      for (const entry of lex.entries) {
        if (entry.severity === undefined) continue;
        expect(SEVERITIES.has(entry.severity), `${lex.id}: bad entry severity "${entry.severity}"`).toBe(true);
      }
    }
  });

  it("has no duplicate match entries within a single lexicon", () => {
    for (const lex of LEXICONS) {
      const keys = lex.entries.map((e) => (Array.isArray(e.match) ? e.match.join(" ") : e.match) + "|" + (e.posGate ?? ""));
      expect(new Set(keys).size, `${lex.id}: duplicate entries`).toBe(keys.length);
    }
  });
});

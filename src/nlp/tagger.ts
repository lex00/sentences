// Coarse POS tagger. Closed-class words get real tags from the lexicon; open-class words are
// left as "X" (ambiguous noun/verb/adjective) and disambiguated by position in the chunker.

import { DET, POSS, PRON, PREP, SUBORD, REL, CONJ, MODAL, COPULA, AUX, ADV, isNumber } from "./lexicon.js";

export type Tagged = { word: string; lc: string; tag: Tag; forced?: "V" };
export type Tag = "DT" | "PRP$" | "PRP" | "IN" | "SUB" | "REL" | "CC" | "MD" | "COP" | "AUX" | "RB" | "CD" | "X" | "," | ".";

export function tokenize(text: string): string[] {
  return text
    .replace(/([.,!?;:])/g, " $1 ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function tagOne(word: string): Tag {
  const lc = word.toLowerCase();
  if (/^[.!?;:]$/.test(word)) return ".";
  if (word === ",") return ",";
  if (isNumber(word)) return "CD";
  if (DET.has(lc)) return "DT"; // note: "that" -> DT (demonstrative) takes precedence over REL
  if (POSS.has(lc)) return "PRP$";
  if (CONJ.has(lc)) return "CC";
  if (MODAL.has(lc)) return "MD";
  if (COPULA.has(lc)) return "COP";
  if (AUX.has(lc)) return "AUX";
  if (SUBORD.has(lc)) return "SUB";
  if (REL.has(lc)) return "REL";
  if (PREP.has(lc)) return "IN";
  if (PRON.has(lc)) return "PRP";
  if (ADV.has(lc) || (lc.endsWith("ly") && lc.length > 3)) return "RB";
  return "X"; // open-class: noun / verb / adjective — resolved in the chunker
}

export function tag(text: string): Tagged[] {
  return tokenize(text).map((word) => ({ word, lc: word.toLowerCase(), tag: tagOne(word) }));
}

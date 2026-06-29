// IR — the semantic layer. What *roles* exist, not where pixels go.
// The constituency parse is lowered to this before any layout happens.

export type Word = {
  text: string;
};

export type Clause = {
  subject: Nominal;
  verb: Verbal;
  complement: Complement | null; // direct object, predicate noun/adj, or null (intransitive)
};

export type Nominal = {
  head: Word;
  modifiers: Modifier[]; // hang below the head
  appositive?: Word; // drawn in parens on the baseline
};

export type Verbal = {
  head: Word; // may be a verb phrase ("has been running")
  modifiers: Modifier[];
  indirectObject?: Nominal; // hangs below on a slant + rail
};

export type Complement =
  | { kind: "directObject"; value: Nominal } // divider: half-vertical, on baseline
  | { kind: "predicateNoun"; value: Nominal } // divider: lean-left
  | { kind: "predicateAdj"; value: Word }; // divider: lean-left

export type Modifier =
  | { kind: "word"; value: Word } // adj/article/adverb/possessive -> slant
  | { kind: "prep"; prep: Word; object: Nominal } // slant carries prep, sub-rail carries object  (recursion)
  | { kind: "clause"; value: Clause; connector: Word }; // relative/subordinate, dotted connection  (recursion)

// Compound wrapper (compound subject/predicate/object): fork + dotted conjunction line.
export type Compound<T> = { items: T[]; conjunction: Word };

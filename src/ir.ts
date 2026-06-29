// IR — the semantic layer. What *roles* exist, not where pixels go.
// The constituency parse is lowered to this before any layout happens.

export type Word = {
  text: string;
};

// Head slots may be single or compound ("dogs and cats run").
export type Subject = Nominal | Compound<Nominal>;
export type Predicate = Verbal | Compound<Verbal>;

export type Clause = {
  subject: Subject;
  verb: Predicate;
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
  | { kind: "directObject"; value: Nominal | Compound<Nominal> } // divider: half-vertical, on baseline
  | { kind: "predicateNoun"; value: Nominal | Compound<Nominal> } // divider: lean-left
  | { kind: "predicateAdj"; value: Word | Compound<Word> }; // divider: lean-left ("tiny and loud" -> fork)

export type Modifier =
  | { kind: "word"; value: Word } // adj/article/adverb/possessive -> slant
  | { kind: "prep"; prep: Word; object: Nominal } // slant carries prep, sub-rail carries object  (recursion)
  | { kind: "clause"; value: Clause; connector: Word }; // relative/subordinate, dotted connection  (recursion)

// Compound wrapper (compound subject/predicate/object): fork + dotted conjunction line.
export type Compound<T> = { items: T[]; conjunction: Word };

// A whole sentence: one clause, or several independent clauses coordinated into a compound
// sentence ("Birds sing and dogs bark"). conjunctions[i] joins clauses[i] and clauses[i+1].
export type Sentence = { clauses: Clause[]; conjunctions: Word[] };

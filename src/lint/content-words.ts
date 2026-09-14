// Function words and inflection folding, shared by the rules that need to ask "is this token
// carrying meaning, and have I seen this meaning already?".
//
// Both halves started life inside rules/dead-metaphor.ts and moved here when a second rule
// (rules/low-value-sentence.ts) needed the same two answers. Nothing trope-specific lives here:
// this is vocabulary machinery, not a lexicon. The lexicons/ directory is for trope triggers and
// has its own shape (POS gates, severities, a barrel and a hygiene test); a list of English
// function words would be a foreign object in it.

// --- function words -------------------------------------------------------------------------

// A small, closed, hand-picked list of English function words — pronouns, articles, prepositions,
// conjunctions, auxiliaries, negation, degree words (~130 entries). "Content word" throughout the
// linter means "not one of these", which is coarse on purpose: there is no frequency corpus
// available at runtime, in the browser build least of all.
export const STOPWORDS = new Set([
  "a", "an", "the",
  "i", "me", "my", "mine", "myself", "you", "your", "yours", "yourself", "yourselves",
  "he", "him", "his", "himself", "she", "her", "hers", "herself", "it", "its", "itself",
  "we", "us", "our", "ours", "ourselves", "they", "them", "their", "theirs", "themselves",
  "this", "that", "these", "those",
  "who", "whom", "whose", "which", "what", "whatever", "whichever", "whoever",
  "and", "or", "but", "nor", "so", "yet", "if", "because", "although", "though", "while", "as",
  "than", "whether", "unless", "until", "since",
  "in", "on", "at", "by", "for", "with", "about", "against", "between", "into", "through",
  "during", "before", "after", "above", "below", "to", "from", "up", "down", "over", "under",
  "again", "further", "once", "of", "off", "out",
  "be", "am", "is", "are", "was", "were", "been", "being",
  "have", "has", "had", "having",
  "do", "does", "did", "doing",
  "will", "would", "shall", "should", "may", "might", "must", "can", "could",
  "not", "no", "nor",
  "there", "here",
  "very", "too", "also", "just", "only", "even", "still", "then",
  "all", "any", "some", "each", "every", "other", "another", "such", "own", "same",
  "etc",
]);

// --- inflection folding ---------------------------------------------------------------------

// Collapses common English inflections so "wall"/"walls" and "parse"/"parsed" count as one word.
// It's suffix-stripping, not a dictionary lemmatizer — good enough to group inflections of the
// SAME word within one document, not meant to be linguistically exact (see the false negative on
// "trees" vs "tree" that dead-metaphor.test.ts documents and accepts).
//
// It errs toward folding too LITTLE, which is the safe direction for both callers. A caller asking
// "have I seen this word already?" gets a no when in doubt, so an under-folded pair reads as two
// different words and the rule stays quiet; an over-folded one would silently merge two distinct
// words and make a rule fire on a sentence that did introduce something.
export function lemmatize(lower: string): string {
  if (lower.length <= 3) return lower;
  if (/[^aeiou]ies$/.test(lower)) return `${lower.slice(0, -3)}y`; // parties -> party
  if (/(sses|shes|ches|xes|zes)$/.test(lower)) return lower.slice(0, -2); // boxes -> box
  if (/[^aeiou]s$/.test(lower)) return lower.slice(0, -1); // walls -> wall, doors -> door
  if (/[^aeiou]ing$/.test(lower) && lower.length > 5) return lower.slice(0, -3); // walking -> walk
  if (/[^aeiou]ed$/.test(lower) && lower.length > 4) return lower.slice(0, -2); // walked -> walk
  return lower;
}

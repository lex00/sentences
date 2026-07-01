// POS tagger backed by `compromise` (pure-JS, ships in the bundle — no WASM, no model
// download). It replaced a hand-rolled lexicon+morphology tagger whose failures were all POS
// ambiguities a rule can't resolve ("sally" noun vs -ly adverb; "sold" verb vs unknown word).
//
// We map compromise's rich tag set down to the coarse tags the chunker (parse.ts) consumes.
// Open-class words stay "X" (the chunker assigns noun/adjective by position); a detected verb
// is marked forced:"V" so the chunker treats it as the predicate reliably.
//
// ENGLISH-SPECIFIC: this + parse.ts + lower.ts are the English layer. A future multilingual
// path swaps in a Universal-Dependencies parser and a dependency->IR lowering; the IR and
// everything downstream are unchanged.
import nlp from "compromise";
import { POSS, AUX, SUBORD, REL, ADV } from "./lexicon.js";
function mapTags(word, tags) {
    const lc = word.toLowerCase();
    if (/^[.!?;:]$/.test(word))
        return { tag: "." };
    if (word === ",")
        return { tag: "," };
    if (lc === "to")
        return { tag: "TO" }; // infinitive marker OR preposition — disambiguated in the chunker
    if (POSS.has(lc))
        return { tag: "PRP$" };
    if (SUBORD.has(lc))
        return { tag: "SUB" };
    if (AUX.has(lc))
        return { tag: "AUX" };
    if (REL.has(lc) && !tags.has("Determiner"))
        return { tag: "REL" };
    if (tags.has("Determiner"))
        return { tag: "DT" };
    if (tags.has("Modal"))
        return { tag: "MD" };
    if (tags.has("Copula"))
        return { tag: "COP" };
    if (tags.has("Conjunction"))
        return { tag: "CC" };
    if (tags.has("Pronoun"))
        return { tag: "PRP" };
    if (tags.has("Preposition"))
        return { tag: "IN" };
    if (tags.has("Adverb") || tags.has("Negative") || ADV.has(lc))
        return { tag: "RB" }; // incl. "not"
    if (tags.has("Value") || tags.has("Cardinal"))
        return { tag: "CD" };
    if (tags.has("Verb"))
        return { tag: "X", forced: "V" }; // open-class verb -> the predicate
    if (tags.has("Adjective"))
        return { tag: "JJ" };
    return { tag: "X" }; // noun / unknown -> resolved by position in the chunker
}
export function tag(text) {
    // compromise's published types don't expose the runtime json() options shape; cast past it.
    const sentences = nlp(text).json({ terms: true });
    const out = [];
    for (const sent of sentences) {
        for (const t of sent.terms) {
            const word = t.text;
            if (!word)
                continue;
            const m = mapTags(word, new Set(t.tags ?? []));
            out.push(m.forced ? { word, lc: word.toLowerCase(), tag: m.tag, forced: m.forced } : { word, lc: word.toLowerCase(), tag: m.tag });
        }
    }
    return out;
}

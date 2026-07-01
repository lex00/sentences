// Document splitter: break input on sentence boundaries (. ! ? ; :) into units, parse each
// independently, and merge into one Sentence whose clauses stack. Units that don't parse
// (fragments like "Interesting question in the Hacker News discussion") are skipped rather than
// failing the whole input. Coordinated clauses inside a unit keep their conjunction; the gap
// BETWEEN units is null (separate sentences, drawn stacked with no connector).
import { parse } from "./nlp/parse.js";
import { lowerSentence } from "./lower.js";
export function parseDocument(text) {
    const units = text.split(/[.!?;:]+/).map((u) => u.trim()).filter(Boolean);
    const clauses = [];
    const conjunctions = [];
    for (const unit of units) {
        let sent;
        try {
            sent = lowerSentence(parse(unit));
        }
        catch {
            continue; // fragment / unparseable unit — skip it
        }
        if (clauses.length > 0)
            conjunctions.push(null); // boundary between separate sentences
        clauses.push(...sent.clauses);
        conjunctions.push(...sent.conjunctions); // intra-unit coordination keeps its conjunctions
    }
    if (clauses.length === 0)
        throw new Error("nothing diagrammable");
    return { clauses, conjunctions };
}

// analyze — the game-facing "what did the player write?" call. Parse a sentence, lay it out, and
// return its role-labeled elements in one step. The direction a game uses the neural parser: a
// fill-your-own-words or free-write mode re-parses the player's sentence and checks the roles that
// came back (does a direct object exist? did the word land in the slot the prompt asked for?).
//
// Depends only on a minimal Parser (text -> Tree), which ModelParser satisfies. So this module is
// pure at runtime — no onnxruntime — and testable with a stub; the caller supplies the real model.
import { lowerSentence } from "./lower.js";
import { layout } from "./layout.js";
import { describeAll } from "./inspect.js";
import { defaultLayoutStyle } from "./theme.js";
// Parse `text` with the supplied parser (typically ModelParser) and return the parse tree (which
// keeps the fine POS tags), the diagram, and every word/line with its grammatical role + geometry.
export async function analyze(parser, text, m, sizePx = defaultLayoutStyle.em) {
    const tree = await parser.parse(text);
    const scene = layout(lowerSentence(tree), m, defaultLayoutStyle);
    return { tree, scene, elements: describeAll(scene, m, sizePx) };
}
// The fillable word slots (the leaf words), left-to-right — what a fill-your-own / drag mode maps
// its inputs onto, and what a criteria check counts over.
export const wordSlots = (a) => a.elements.filter((e) => e.kind === "word").sort((p, q) => p.anchor.x - q.anchor.x);

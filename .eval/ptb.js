// Penn-Treebank bracket parser. benepar (and most constituency parsers) emit parses as nested
// labelled brackets, e.g. (S (NP (DT the) (NN dog)) (VP (VBD barked) (ADVP (RB loudly)))).
// This turns that string into a Tree; src/lower.ts lowers a Tree into our Clause IR.
export function parseBracket(input) {
    const toks = input.replace(/\(/g, " ( ").replace(/\)/g, " ) ").trim().split(/\s+/);
    let i = 0;
    function node() {
        if (toks[i] !== "(")
            throw new Error(`PTB: expected '(' at token ${i}, got ${toks[i] ?? "EOF"}`);
        i++; // consume '('
        const label = toks[i++];
        if (label === undefined)
            throw new Error("PTB: missing label after '('");
        const children = [];
        let word;
        while (i < toks.length && toks[i] !== ")") {
            if (toks[i] === "(")
                children.push(node());
            else
                word = toks[i++]; // terminal word
        }
        if (toks[i] !== ")")
            throw new Error("PTB: unbalanced parentheses");
        i++; // consume ')'
        return word !== undefined ? { label, word, children } : { label, children };
    }
    const tree = node();
    // unwrap a ROOT/TOP/S1 wrapper if present
    return ["ROOT", "TOP", "S1", ""].includes(tree.label) && tree.children[0] ? tree.children[0] : tree;
}
// All terminal words under a subtree, in order.
export const leaves = (t) => (t.word !== undefined ? [t.word] : t.children.flatMap(leaves));
export const phrase = (t) => leaves(t).join(" ");
// All (word, POS tag) preterminals under a subtree, in order — e.g. { word:"small", tag:"JJ" }.
// The parse keeps the fine POS the IR drops, so criteria like "two adjectives" read straight off it.
export const posTags = (t) => t.word !== undefined ? [{ word: t.word, tag: t.label }] : t.children.flatMap(posTags);

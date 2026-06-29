#!/usr/bin/env python3
"""benepar adapter — the parser integration point.

Reads sentences (one per line) on stdin and prints Penn-Treebank constituency parses
(one bracket string per line) on stdout, in the exact format src/lower.ts consumes:

    (S (NP (DT the) (NN dog)) (VP (VBD barked) (ADVP (RB loudly))))

Setup (heavy: pulls spaCy + benepar + a ~500MB model + PyTorch):

    python3 -m venv .venv && . .venv/bin/activate
    pip install benepar spacy
    python -m spacy download en_core_web_md
    python -c "import benepar; benepar.download('benepar_en3')"

Usage:

    echo "The small dog barked loudly." | python3 tools/parse.py
    # -> (S (NP (DT The) (JJ small) (NN dog)) (VP (VBD barked) (ADVP (RB loudly))))

Pipe the output into the TS side (lower() -> layout()). The renderer never depends on
Python at runtime — this script just produces the bracket strings.
"""
import sys


def main() -> int:
    try:
        import spacy
        import benepar  # noqa: F401
    except ImportError:
        sys.stderr.write("benepar/spacy not installed — see the setup block in this file.\n")
        return 1

    nlp = spacy.load("en_core_web_md")
    if "benepar" not in nlp.pipe_names:
        nlp.add_pipe("benepar", config={"model": "benepar_en3"})

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        doc = nlp(line)
        sents = list(doc.sents)
        if not sents:  # only the first sentence is diagrammed (a documented limit)
            continue
        print(sents[0]._.parse_string, flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

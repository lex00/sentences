# Reads sentences.txt (one per line), parses each with benepar, writes battery.json.
import benepar, nltk, json, sys, warnings
warnings.filterwarnings("ignore")
p = benepar.Parser('benepar_en3')
out = []
for line in open("sentences.txt"):
    s = line.strip()
    if not s or s.startswith("#"): continue
    try:
        words = nltk.word_tokenize(s)
        t = list(p.parse_sents([benepar.InputSentence(words=words)]))[0]
        out.append({"sentence": s, "ptb": " ".join(str(t).split())})
    except Exception as e:
        out.append({"sentence": s, "ptb": None, "error": str(e)[:80]})
json.dump(out, open("battery.json", "w"), indent=0)
print(f"parsed {len(out)} sentences")

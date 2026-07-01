import benepar, nltk, json, warnings
warnings.filterwarnings("ignore")
try: nltk.data.find("tokenizers/punkt")
except LookupError: nltk.download("punkt", quiet=True)
try: nltk.data.find("tokenizers/punkt_tab")
except LookupError: nltk.download("punkt_tab", quiet=True)
p=benepar.Parser('benepar_en3')
sents=[
 "The dog barked.","The big dog chased the ball.","Sarah went to France after leaving Portugal.",
 "It won't be the carbon dioxide that kills us.",
 "There is a dangerous myth circulating right now that AI agents mean the end of the Pull Request.",
 "She likes to read books.","Dogs and cats chase mice.","The man in the house slept.",
 "My dog is tiny and loud.","The children played quickly in the park.","Who chased the cat?",
 "Is the sky blue?","The teacher gave the students homework.","Birds sing and dogs bark.",
 "The book on the table is mine.","I want to go home.","He said that she was right.",
 "The quick brown fox jumps over the lazy dog.","We will meet at the station before noon.",
 "The dog that barked ran away.","A small bird sang sweetly.","They built a house near the river.",
 "Can a tap mechanic still feel like a puzzle if the player has to think about layers and chain reactions?",
]
out=[]
for s in sents:
    words=nltk.word_tokenize(s)
    t=list(p.parse_sents([benepar.InputSentence(words=words)]))[0]
    out.append({"sentence":s,"ptb":" ".join(str(t).split())})
json.dump(out, open("corpus.json","w"), indent=0)
print("wrote", len(out), "parses")

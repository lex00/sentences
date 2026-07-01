import benepar, nltk, warnings
warnings.filterwarnings("ignore")
p=benepar.Parser('benepar_en3')
s="Can a tap mechanic still feel like a puzzle if the player has to think about layers and chain reactions?"
words=nltk.word_tokenize(s)
t=list(p.parse_sents([benepar.InputSentence(words=words)]))[0]
print(" ".join(str(t).split()))

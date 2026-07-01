import benepar, nltk, warnings
warnings.filterwarnings("ignore")
p=benepar.Parser('benepar_en3')
s="the big dog sat on the little dog"
t=list(p.parse_sents([benepar.InputSentence(words=nltk.word_tokenize(s))]))[0]
print(" ".join(str(t).split()))

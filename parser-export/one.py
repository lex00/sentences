import benepar, warnings
warnings.filterwarnings("ignore")
p=benepar.Parser('benepar_en3')
words=["Sarah","went","to","France","after","leaving","Portugal"]
t=list(p.parse_sents([benepar.InputSentence(words=words, space_after=[True]*6+[False])]))[0]
print(" ".join(str(t).split()))

import benepar, sys
benepar.download('benepar_en3')
parser = benepar.Parser('benepar_en3')
sent = benepar.InputSentence(words=['It', "wo", "n't", 'be', 'the', 'carbon', 'dioxide', 'that', 'kills', 'us', '.'])
for t in parser.parse_sents([sent]):
    print(t)

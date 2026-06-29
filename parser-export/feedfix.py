import benepar, json, warnings
warnings.filterwarnings("ignore")
p=benepar.Parser('benepar_en3'); m=p._parser
def feeds(words):
    sp=[True]*(len(words)-1)+[False]
    b=m.pad_encoded([m.encode(benepar.InputSentence(words=words, space_after=sp))])
    return {k:[int(x) for x in b[k][0].tolist()] for k in ["input_ids","attention_mask","words_from_tokens","decoder_input_ids","decoder_attention_mask"]} | {"valid_token_mask":[bool(x) for x in b["valid_token_mask"][0].tolist()]}
fix=[{"words":w, **feeds(w)} for w in [["The","dog","barked","."],["Dogs","run"],["she","likes","to","read","books","."],["the","carbon","dioxide"]]]
json.dump(fix, open("feed-fixtures.json","w"))
print("wrote feed fixtures:", [f["words"] for f in fix])

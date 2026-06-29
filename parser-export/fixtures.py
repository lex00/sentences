import benepar, torch, json, warnings
warnings.filterwarnings("ignore")
p = benepar.Parser('benepar_en3'); m = p._parser; m.eval()
dec = m.decoder
n_lab = m.f_label[-1].out_features + 1
label_from_index = [dec.label_from_index.get(i, "") for i in range(n_lab)]
tag_from_index = {int(i): t for i, t in m.tag_from_index.items()}
json.dump({"label_from_index": label_from_index, "tag_from_index": tag_from_index,
           "force_root_constituent": bool(dec.force_root_constituent)}, open("vocab.json", "w"))
print("labels:", n_lab, " tags:", len(tag_from_index), " root_forced:", bool(dec.force_root_constituent))

sents = [["The","dog","barked","."],
         ["the","big","dog","chased","the","ball","."],
         ["she","likes","to","read","books","."],
         ["dogs","and","cats","chase","mice","."]]
fix = []
for words in sents:
    sp = [True]*(len(words)-1)+[False]
    ex = benepar.InputSentence(words=words, space_after=sp)
    batch = m.pad_encoded([m.encode(ex)]); batch["words_from_tokens"]=batch["words_from_tokens"].clamp_min(0)
    with torch.no_grad(): ss, ts = m.forward(batch)
    n = len(words)
    ss = ss[0,:n,:n,:].numpy()
    tag_ids = ts[0].argmax(-1).numpy()[1:n+1].tolist()
    gold = list(p.parse_sents([benepar.InputSentence(words=words, space_after=sp)]))[0]
    fix.append({"words":words, "spanScores":[[ [round(float(x),4) for x in ss[i][j]] for j in range(n)] for i in range(n)],
                "tagIds":[int(t) for t in tag_ids], "tree":" ".join(str(gold).split())})
json.dump(fix, open("fixtures.json","w"))
print("wrote", len(fix), "fixtures; e.g.:", fix[0]["tree"])

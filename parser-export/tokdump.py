import benepar, json, warnings
warnings.filterwarnings("ignore")
p=benepar.Parser('benepar_en3'); m=p._parser
tok = m.retokenizer.tokenizer
bt = json.loads(tok.backend_tokenizer.to_str())
model = bt["model"]
print("model type:", model["type"], " unk_id:", model.get("unk_id"))
print("normalizer:", json.dumps(bt.get("normalizer"))[:200])
print("pre_tokenizer:", json.dumps(bt.get("pre_tokenizer"))[:200])
vocab = model["vocab"]  # list of [piece, score]
json.dump({"vocab": vocab, "unk_id": model.get("unk_id", 2), "eos_id": tok.eos_token_id, "pad_id": tok.pad_token_id},
          open("t5-unigram.json","w"))
print("vocab size:", len(vocab), " sample:", vocab[:3], vocab[35:38])
# word->subword-id fixtures (word-by-word tokenization, which is how we'll do it in JS)
words = ["The","dog","barked",".","Dogs","run","carbon","dioxide","seashells","Mythos","quickly","to","read"]
fix = {w: tok(w, add_special_tokens=False)["input_ids"] for w in words}
json.dump(fix, open("tok-fixtures.json","w"))
print("tok fixtures e.g. 'barked' ->", fix["barked"], " '.' ->", fix["."])

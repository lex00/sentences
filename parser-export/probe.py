import benepar, torch
p = benepar.Parser('benepar_en3'); m = p._parser; m.eval()
words=['The','dog','barked','.']
ex = benepar.InputSentence(words=words, space_after=[True,True,False,False])
batch = m.pad_encoded([m.encode(ex)])
print("BATCH KEYS + shapes:")
for k,v in batch.items():
    print(f"  {k}: {tuple(v.shape) if torch.is_tensor(v) else v} {v.dtype if torch.is_tensor(v) else ''}")
with torch.no_grad():
    ss,ts = m.forward(batch)
print("span_scores:", tuple(ss.shape), ss.dtype)
# encoder-only param count vs full
enc = m.pretrained_model.get_encoder()
print("T5 full params:", sum(p.numel() for p in m.pretrained_model.parameters())//1000, "k")
print("T5 encoder params:", sum(p.numel() for p in enc.parameters())//1000, "k")
print("extra encoder params:", sum(p.numel() for p in m.encoder.parameters())//1000 if m.encoder else 0, "k")
print("f_label params:", sum(p.numel() for p in m.f_label.parameters())//1000, "k")

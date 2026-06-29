import benepar, torch, numpy as np, onnxruntime as ort, warnings, os
warnings.filterwarnings("ignore")
from onnxruntime.quantization import quantize_dynamic, QuantType
quantize_dynamic("benepar.onnx","benepar.int8.onnx",weight_type=QuantType.QInt8)
print("int8 size:", os.path.getsize("benepar.int8.onnx")//1024//1024,"MB")
p=benepar.Parser('benepar_en3'); m=p._parser; m.eval(); dec=m.decoder
sess=ort.InferenceSession("benepar.int8.onnx",providers=["CPUExecutionProvider"])
keys=["input_ids","attention_mask","words_from_tokens","decoder_input_ids","decoder_attention_mask","valid_token_mask"]
ok=0; tot=0
for words in [["The","dog","barked","."],["she","likes","to","read","books","."],["the","big","dog","chased","the","ball","."],["dogs","and","cats","chase","mice","."],["It","wo","n't","be","the","carbon","dioxide","that","kills","us","."]]:
    sp=[True]*(len(words)-1)+[False]
    b=m.pad_encoded([m.encode(benepar.InputSentence(words=words,space_after=sp))]); b["words_from_tokens"]=b["words_from_tokens"].clamp_min(0)
    feeds={k:(b[k].numpy().astype(np.bool_) if b[k].dtype==torch.bool else b[k].numpy().astype(np.int64)) for k in keys}
    ss,ts=sess.run(["span_scores","tag_scores"],feeds)
    n=len(words)
    tags=[m.tag_from_index[int(i)] for i in ts[0].argmax(-1)[1:n+1]]
    leaves=[(w,t) for w,t in zip(words,tags)]
    tree=dec.tree_from_scores(ss[0,:n,:n,:], leaves)
    gold=list(p.parse_sents([benepar.InputSentence(words=words,space_after=sp)]))[0]
    match=" ".join(str(tree).split())==" ".join(str(gold).split())
    tot+=1; ok+=match
    print(("OK " if match else "DIFF ")+ " ".join(words))
    if not match: print("   int8:", " ".join(str(tree).split())[:120]); print("   gold:", " ".join(str(gold).split())[:120])
print(f"\nint8 end-to-end: {ok}/{tot} trees match the reference")

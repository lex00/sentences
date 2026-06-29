import benepar, torch, torch.nn.functional as F, warnings, os
warnings.filterwarnings("ignore")
# Patch: the only integer relu is F.relu(words_from_tokens) clamping -100->0. The caller will
# pre-clamp, so make integer relu a no-op (keeps the unsupported int64 Relu out of the graph).
_relu = F.relu
F.relu = lambda x,*a,**k: (x if not x.is_floating_point() else _relu(x,*a,**k))

p = benepar.Parser('benepar_en3'); m = p._parser; m.eval()
ex = benepar.InputSentence(words=['The','dog','barked','.'], space_after=[True,True,False,False])
batch = m.pad_encoded([m.encode(ex)])
batch["words_from_tokens"] = batch["words_from_tokens"].clamp_min(0)  # pre-clamp

class W(torch.nn.Module):
    def __init__(s, m): super().__init__(); s.m = m
    def forward(s, input_ids, attention_mask, words_from_tokens, decoder_input_ids, decoder_attention_mask, valid_token_mask):
        return s.m.forward(dict(input_ids=input_ids, attention_mask=attention_mask, words_from_tokens=words_from_tokens,
            decoder_input_ids=decoder_input_ids, decoder_attention_mask=decoder_attention_mask, valid_token_mask=valid_token_mask))[0]

keys=["input_ids","attention_mask","words_from_tokens","decoder_input_ids","decoder_attention_mask","valid_token_mask"]
args=tuple(batch[k] for k in keys)
dyn={k:{0:"b",1:"s"} for k in keys}; dyn["span_scores"]={0:"b",1:"w",2:"w2"}
torch.onnx.export(W(m).eval(), args, "benepar.onnx", opset_version=17, input_names=keys,
    output_names=["span_scores"], dynamic_axes=dyn, do_constant_folding=True, dynamo=False)
print("re-exported, fp32:", os.path.getsize("benepar.onnx")//1024//1024, "MB")

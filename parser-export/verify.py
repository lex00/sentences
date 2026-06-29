import benepar, torch, numpy as np, onnxruntime as ort, warnings, os
warnings.filterwarnings("ignore")
from onnxruntime.quantization import quantize_dynamic, QuantType
if not os.path.exists("benepar.int8.onnx"):
    quantize_dynamic("benepar.onnx","benepar.int8.onnx",weight_type=QuantType.QInt8)
print("int8 size:", os.path.getsize("benepar.int8.onnx")//1024//1024,"MB")
p=benepar.Parser('benepar_en3'); m=p._parser; m.eval()
words=['It','wo',"n't",'be','the','carbon','dioxide','that','kills','us','.']
ex=benepar.InputSentence(words=words, space_after=[True,False,True,True,True,True,True,True,True,False,False])
batch=m.pad_encoded([m.encode(ex)]); batch["words_from_tokens"]=batch["words_from_tokens"].clamp_min(0)
keys=["input_ids","attention_mask","words_from_tokens","decoder_input_ids","decoder_attention_mask","valid_token_mask"]
with torch.no_grad(): ss_t,_=m.forward(batch)
ss_t=ss_t.numpy(); print("torch span_scores range: [%.2f, %.2f]"%(ss_t.min(),ss_t.max()))
for tag,f in [("fp32","benepar.onnx"),("int8","benepar.int8.onnx")]:
    s=ort.InferenceSession(f,providers=["CPUExecutionProvider"])
    feeds={k:(batch[k].numpy().astype(np.bool_) if batch[k].dtype==torch.bool else batch[k].numpy().astype(np.int64)) for k in keys}
    ss_o=s.run(["span_scores"],feeds)[0]
    diff=np.abs(ss_o-ss_t).max()
    argmatch=(ss_o.argmax(-1)==ss_t.argmax(-1)).mean()
    print(f"  {tag}: max|onnx-torch|={diff:.4f}  argmax-label agreement={argmatch*100:.1f}%")

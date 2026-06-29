import benepar, torch, warnings
warnings.filterwarnings("ignore")
p=benepar.Parser('benepar_en3'); m=p._parser
tok = m.retokenizer.tokenizer
print("pad_id:", tok.pad_token_id, " eos_id:", tok.eos_token_id, " is_t5:", m.retokenizer.is_t5)
print("start_token_idx:", m.retokenizer.start_token_idx, " stop_token_idx:", m.retokenizer.stop_token_idx)
for words in [["The","dog","barked","."], ["Dogs","run"]]:
    sp=[True]*(len(words)-1)+[False]
    b = m.pad_encoded([m.encode(benepar.InputSentence(words=words, space_after=sp))])
    print("\nwords:", words)
    for k in ["input_ids","attention_mask","words_from_tokens","decoder_input_ids","decoder_attention_mask","valid_token_mask"]:
        print(f"  {k}: {b[k][0].tolist()}")
    print("  subword pieces:", tok.convert_ids_to_tokens(b["input_ids"][0].tolist()))

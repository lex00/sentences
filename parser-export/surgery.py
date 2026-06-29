import onnx, warnings
warnings.filterwarnings("ignore")
m = onnx.load("benepar.onnx")
g = m.graph
# find Relu nodes whose input is the graph input 'words_from_tokens' (or directly downstream)
relus = [n for n in g.node if n.op_type=="Relu"]
print("total Relu nodes:", len(relus))
for n in g.node:
    if n.op_type=="Relu" and "words_from_tokens" in n.input:
        print("CULPRIT Relu:", n.name, "in:", list(n.input), "out:", list(n.output))

import benepar, nltk, json, warnings
warnings.filterwarnings("ignore")
try: nltk.data.find("tokenizers/punkt")
except LookupError: nltk.download("punkt", quiet=True)
try: nltk.data.find("tokenizers/punkt_tab")
except LookupError: nltk.download("punkt_tab", quiet=True)
p=benepar.Parser('benepar_en3')
sents=[
 "The dog barked.","The big dog chased the ball.","Sarah went to France after leaving Portugal.",
 "It won't be the carbon dioxide that kills us.",
 "There is a dangerous myth circulating right now that AI agents mean the end of the Pull Request.",
 "She likes to read books.","Dogs and cats chase mice.","The man in the house slept.",
 "My dog is tiny and loud.","The children played quickly in the park.","Who chased the cat?",
 "Is the sky blue?","The teacher gave the students homework.","Birds sing and dogs bark.",
 "The book on the table is mine.","I want to go home.","He said that she was right.",
 "The quick brown fox jumps over the lazy dog.","We will meet at the station before noon.",
 "The dog that barked ran away.","A small bird sang sweetly.","They built a house near the river.","The big dog sat on the little dog.",
 "Can a tap mechanic still feel like a puzzle if the player has to think about layers and chain reactions?",
 # constructions added while closing battery gaps (imperatives, interjections, IO, objective
 # complements, correlatives, verbal/clause subjects, participles, appositives, causative, absolute)
 "Sit!","Man, that hurt!","Alicia's hobby is to ride trail horses.",
 "Mrs. Doubtfire gave the children homework.","They elected my uncle mayor.","This music makes me happy.",
 "Both Max and I hit homers.","She either complains or criticizes.","Neither Laura nor Carla could come.",
 "Running marathons is fun.","To master a new skill takes patience.","Whoever made this pottery did a good job.",
 "The dog, barking furiously, chased the frightened boy.","I hate burned toast.",
 "Grendel terrorized the countryside, but finally the hero Beowulf stopped him.",
 "Professor Villa made her students read four novels.","Smoke alarms screaming, my family awoke to a fire.",
 "Today Darren left his office earlier than he usually does.",
 # batch 3: compound predicates, adverbials, coordination, passive, stacked PPs
 "The dog has black fur and can jump high.",
 "The small dog barked loudly and then jumped out the window.",
 "She quietly closed the book and slowly stood up.",
 "I like to grow plants especially in the winter.",
 "She not only sings but also dances.",
 "The rain fell, and because the field flooded, the game stopped.",
 "The ball was thrown by the boy.",
 "The book on the table in the corner is old.",
]
out=[]
for s in sents:
    words=nltk.word_tokenize(s)
    t=list(p.parse_sents([benepar.InputSentence(words=words)]))[0]
    out.append({"sentence":s,"ptb":" ".join(str(t).split())})
json.dump(out, open("corpus.json","w"), indent=0)
print("wrote", len(out), "parses")

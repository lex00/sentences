// Curated, pre-verified sentences for the identify-the-type game. Diagrams are correct by
// construction (from the battery), so this mode needs no model at runtime.

export type BankItem = { sentence: string; ptb: string };

export const BANK: BankItem[] = [
  {
    "sentence": "Running is my favorite sport.",
    "ptb": "(TOP (S (NP (NN Running)) (VP (VBZ is) (NP (PRP$ my) (JJ favorite) (NN sport))) (. .)))"
  },
  {
    "sentence": "I love the person who cleaned the house!",
    "ptb": "(TOP (S (NP (PRP I)) (VP (VBP love) (NP (NP (DT the) (NN person)) (SBAR (WHNP (WP who)) (S (VP (VBD cleaned) (NP (DT the) (NN house))))))) (. !)))"
  },
  {
    "sentence": "Mrs. Doubtfire gave the children homework.",
    "ptb": "(TOP (S (NP (NNP Mrs.) (NNP Doubtfire)) (VP (VBD gave) (NP (DT the) (NNS children)) (NP (NN homework))) (. .)))"
  },
  {
    "sentence": "They elected my uncle mayor.",
    "ptb": "(TOP (S (NP (PRP They)) (VP (VBD elected) (NP (PRP$ my) (NN uncle)) (S (NP (NN mayor)))) (. .)))"
  },
  {
    "sentence": "This music makes me happy.",
    "ptb": "(TOP (S (NP (DT This) (NN music)) (VP (VBZ makes) (S (NP (PRP me)) (ADJP (JJ happy)))) (. .)))"
  },
  {
    "sentence": "Both Max and I hit homers.",
    "ptb": "(TOP (S (NP (DT Both) (NNP Max) (CC and) (PRP I)) (VP (VBD hit) (NP (NNS homers))) (. .)))"
  },
  {
    "sentence": "The dog has black fur and can jump high.",
    "ptb": "(TOP (S (NP (DT The) (NN dog)) (VP (VP (VBZ has) (NP (JJ black) (NN fur))) (CC and) (VP (MD can) (VP (VB jump) (ADVP (RB high))))) (. .)))"
  },
  {
    "sentence": "The book on the table in the corner is old.",
    "ptb": "(TOP (S (NP (NP (DT The) (NN book)) (PP (IN on) (NP (NP (DT the) (NN table)) (PP (IN in) (NP (DT the) (NN corner)))))) (VP (VBZ is) (ADJP (JJ old))) (. .)))"
  },
  {
    "sentence": "She either complains or criticizes.",
    "ptb": "(TOP (S (NP (PRP She)) (VP (CC either) (VBZ complains) (CC or) (VBZ criticizes)) (. .)))"
  },
  {
    "sentence": "The ball was thrown by the boy.",
    "ptb": "(TOP (S (NP (DT The) (NN ball)) (VP (VBD was) (VP (VBN thrown) (PP (IN by) (NP (DT the) (NN boy))))) (. .)))"
  },
  {
    "sentence": "The bigger dog won the race.",
    "ptb": "(TOP (S (NP (DT The) (JJR bigger) (NN dog)) (VP (VBD won) (NP (DT the) (NN race))) (. .)))"
  },
  {
    "sentence": "The small dog barked loudly and then jumped out the window.",
    "ptb": "(TOP (S (NP (DT The) (JJ small) (NN dog)) (VP (VP (VBD barked) (ADVP (RB loudly))) (CC and) (ADVP (RB then)) (VP (VBD jumped) (PP (IN out) (NP (DT the) (NN window))))) (. .)))"
  }
];

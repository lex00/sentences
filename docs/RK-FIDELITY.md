# Reed-Kellogg Fidelity — construction inventory & status

The project built R-K's **skeleton** correctly but approximates several constructions (and
string-joined some, like infinitives). Goal: true word-granular R-K, where every word and
construction has its specific line/notation. This is the north star + status tracker.

Legend: ✅ done · 🟡 partial/approximated · ❌ missing · 🐞 wrong (shortcut)

## Core skeleton (have)

| Construction | R-K notation | Status |
|---|---|---|
| Subject + predicate | baseline, **full** vertical divider (crosses baseline) | ✅ |
| Direct object | baseline, **half** vertical (sits on baseline) | ✅ |
| Predicate noun | back-slant divider (leans toward subject) | ✅ |
| Predicate adjective | back-slant divider | ✅ |
| Adjective / article / possessive | slant line under the noun | ✅ |
| Adverb | slant under verb / adj / adverb | ✅ |
| Prepositional phrase | slant (prep) + horizontal (object) below modified word | ✅ |
| Verb phrase (helping verbs) | whole phrase together on the baseline ("has been running") | ✅ (correct!) |
| Compound subj / verb / obj | forked baseline + dotted conjunction | ✅ |
| Compound sentence | stacked baselines + dotted step + conjunction | ✅ |
| Subordinate clause | own baseline, dotted connector | 🟡 basic (adverbial only) |

## Verbals — the big missing category

These are why a diagram "has a line for everything." Each is a verb form used as another part
of speech, with its OWN notation. **None implemented yet.**

| Construction | Example | R-K notation | Status |
|---|---|---|---|
| **Infinitive** | "I need **to take** a walk" | on a **stand** (pedestal ⊥ rising from the slot); "to" on a slant + verb on a horizontal; keeps its own object/modifiers | 🐞 string-joined into the verb — **first target** |
| **Gerund** | "**Swimming** is fun" | on a **stair-step** line (⌐ steps) sitting in a noun slot on a stand | ❌ |
| **Participle** | "the **barking** dog" | on a **curved** line under the noun it modifies (slant that bends) | ❌ |

A verbal can fill any noun slot (subject/object/predicate-noun) or modify (participle→adj,
infinitive→adj/adv). Layout: each rides a stand/step/curve but reuses the existing rail +
divider + slant primitives — the Scene can already express the geometry.

## Other missing constructions (the long tail)

| Construction | Example | R-K notation | Status |
|---|---|---|---|
| Indirect object | "give **her** a book" | slant under the verb to a horizontal (no written prep) | 🟡 IR slot, not rendered |
| Appositive | "my dog, **Rex**" | in parentheses beside the noun | 🟡 IR field, minimal |
| Objective complement | "elected **her** president" | after DO, back-slant line | ❌ |
| Relative clause | "the dog **that** barked" | subordinate baseline; dotted line from relative pronoun to antecedent | ❌ |
| Noun clause | "**that he left** surprised me" | on a stand/pedestal in the noun slot | ❌ |
| Direct address | "**Rex**, sit" | line above the baseline, detached | ❌ |
| Expletive | "**There** are dogs" | line above, detached | ❌ |
| Interjection | "**Oh**, no" | line above, detached | ❌ |
| Conjunction joining modifiers | "big **and** red" | dotted line between the joined slants | 🟡 |
| Possessive noun ('s) | "the **dog's** bone" | slant under the noun, like an adjective | 🟡 word-mod |

## Plan (incremental, each visually verified before the next)

1. **Infinitives** (fixes the reported bug; establishes the verbal/stand pattern).
2. **Gerunds** (stair-step) and **participles** (curved) — the rest of the verbals.
3. **Indirect objects** (proper notation) + **appositives**.
4. **Relative clauses** + **noun clauses** (stands/connectors).
5. Long tail: direct address, expletive, objective complement, interjection.

NOTE: notation aesthetics CANNOT be verified headlessly. Each construction needs an eyes-on
check in the browser; structural tests only confirm the right nodes/segments exist.
Notation details below should be confirmed against an authoritative R-K reference per step.

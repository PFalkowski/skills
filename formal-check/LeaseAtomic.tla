---- MODULE LeaseAtomic ----
EXTENDS Naturals, FiniteSets
CONSTANTS Workers, NoOne
VARIABLES owner, pc

Init == owner = NoOne /\ pc = [w \in Workers |-> "idle"]

Acquire(w) == pc[w] = "idle" /\ owner = NoOne /\ owner' = w /\ pc' = [pc EXCEPT ![w] = "holding"]
Release(w) == pc[w] = "holding" /\ owner' = NoOne /\ pc' = [pc EXCEPT ![w] = "idle"]

Next == \E w \in Workers : Acquire(w) \/ Release(w)

AtMostOneHolder == Cardinality({w \in Workers : pc[w] = "holding"}) <= 1
====

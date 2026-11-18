---- MODULE LeaseRace ----
EXTENDS Naturals, FiniteSets
CONSTANTS Workers, NoOne
VARIABLES owner, pc

Init == owner = NoOne /\ pc = [w \in Workers |-> "idle"]

Check(w) == pc[w] = "idle" /\ owner = NoOne /\ pc' = [pc EXCEPT ![w] = "checked"] /\ UNCHANGED owner
Take(w) == pc[w] = "checked" /\ owner' = w /\ pc' = [pc EXCEPT ![w] = "holding"]
Release(w) == pc[w] = "holding" /\ owner' = NoOne /\ pc' = [pc EXCEPT ![w] = "idle"]

Next == \E w \in Workers : Check(w) \/ Take(w) \/ Release(w)

AtMostOneHolder == Cardinality({w \in Workers : pc[w] = "holding"}) <= 1
====

from board import standings
from roster import PLAYERS

for rank, name, score in standings(PLAYERS):
    print(rank, name, score)

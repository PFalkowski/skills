import board
import scores

for rank, name, pts in board.ranking(scores.SCORES):
    print(rank, name, pts)

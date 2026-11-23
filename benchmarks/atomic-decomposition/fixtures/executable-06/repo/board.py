def standings(players):
    ordered = sorted(players, key=lambda p: p[1], reverse=True)
    rows = []
    for position, (name, score) in enumerate(ordered, 1):
        if rows and rows[-1][2] == score:
            rank = rows[-1][0]
        else:
            rank = position
        rows.append((rank, name, score))
    return rows

def ranking(scores):
    ordered = sorted(sorted(scores.items()), key=lambda kv: kv[1], reverse=True)
    rows = []
    for i, (name, pts) in enumerate(ordered):
        rank = rows[-1][0] if rows and rows[-1][2] == pts else i + 1
        rows.append((rank, name, pts))
    return rows

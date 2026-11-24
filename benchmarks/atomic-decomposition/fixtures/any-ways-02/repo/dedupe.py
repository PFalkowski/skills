def drop_repeats(rows):
    out = []
    for row in rows:
        if out and out[-1]["id"] == row["id"]:
            continue
        out.append(row)
    return out

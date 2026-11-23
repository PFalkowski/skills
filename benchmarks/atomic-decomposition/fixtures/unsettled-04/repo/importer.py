def dedupe(rows):
    kept = []
    comparisons = 0
    for row in rows:
        duplicate = False
        for other in kept:
            comparisons += 1
            if other["email"] == row["email"]:
                duplicate = True
                break
        if not duplicate:
            kept.append(row)
    return kept, comparisons

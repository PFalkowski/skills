from importer import dedupe

for n in (100, 200, 400):
    rows = [{"email": f"user{i}@example.com"} for i in range(n)]
    kept, comparisons = dedupe(rows)
    print(n, len(kept), comparisons)

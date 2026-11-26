import csv


def write_csv(records, path):
    with open(path, "w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle, lineterminator="\n")
        writer.writerow(["email", "name", "city", "topics"])
        for r in records:
            writer.writerow([r["email"], r["name"], r["city"], ";".join(r["topics"])])
    return len(records)

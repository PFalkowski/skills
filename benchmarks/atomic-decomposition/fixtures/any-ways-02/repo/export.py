from load import main_rows, late_rows


def merged():
    by_id = {}
    for r in main_rows() + late_rows():
        by_id[r["id"]] = r
    return list(by_id.values())


def write(rows):
    seen = set()
    out = []
    for r in rows:
        if r["id"] in seen:
            continue
        seen.add(r["id"])
        out.append("%s,%s" % (r["id"], r["name"]))
    return out


if __name__ == "__main__":
    print("\n".join(write(merged())))

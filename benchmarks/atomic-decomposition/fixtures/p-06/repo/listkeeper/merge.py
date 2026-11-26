def first_non_empty(rows, field):
    for row in rows:
        if row[field]:
            return row[field]
    return ""


def all_topics(rows):
    seen = []
    for row in rows:
        for topic in row["topics"]:
            if topic not in seen:
                seen.append(topic)
    return seen


def merge(rows):
    return {"email": first_non_empty(rows, "email"), "name": first_non_empty(rows, "name"),
            "city": first_non_empty(rows, "city"), "topics": all_topics(rows)}

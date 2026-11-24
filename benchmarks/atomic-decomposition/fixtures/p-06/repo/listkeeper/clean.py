from listkeeper import schema


def topics(text):
    seen = []
    for part in (text or "").split(";"):
        topic = " ".join(part.split()).lower()
        if topic and topic not in seen:
            seen.append(topic)
    return seen


def title(text):
    return " ".join(word[:1].upper() + word[1:] for word in (text or "").split())


def clean_row(row):
    email = schema.normal_email(row.get("email"))
    if not email:
        return None
    return {"email": email, "name": title(row.get("name")), "city": title(row.get("city")),
            "topics": topics(row.get("topics"))}

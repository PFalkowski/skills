FIELDS = ("email", "name", "city", "topics")


class SchemaError(ValueError):
    pass


def normal_email(text):
    return (text or "").strip().lower()


def looks_like_email(text):
    local, at, domain = text.partition("@")
    return bool(local) and bool(at) and "." in domain and " " not in text


def check_record(record):
    missing = [f for f in FIELDS if f not in record]
    if missing:
        raise SchemaError(f"record lacks {', '.join(missing)}")
    if not looks_like_email(normal_email(record["email"])):
        raise SchemaError(f"bad email address {record['email']!r}")
    if not isinstance(record["topics"], list):
        raise SchemaError("topics must be a list")
    return record

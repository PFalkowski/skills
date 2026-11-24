def check_name(name):
    parts = name.split("/")
    if not name or parts[0] in ("", ".."):
        raise ValueError("bad name")
    return name

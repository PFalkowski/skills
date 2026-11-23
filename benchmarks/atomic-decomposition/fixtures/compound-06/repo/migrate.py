RENAMES = {"timeout": "timeout_s"}


def upgrade(raw):
    if raw.get("version", 1) >= 2:
        return dict(raw)
    out = {RENAMES.get(key, key): value for key, value in raw.items()}
    out["version"] = 2
    return out

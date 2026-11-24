DEFAULTS = {"timeout_ms": 5000, "retries": 3, "verbose": False}
RENAMES = {"timeout": "timeout_ms", "retry": "retries", "debug": "verbose"}


def convert(text):
    if text in ("true", "false"):
        return text == "true"
    if text.isdigit():
        return int(text)
    return text


def load(source):
    cfg = dict(DEFAULTS)
    for line in source.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        key, _, text = line.partition("=")
        key = key.strip()
        cfg[RENAMES.get(key, key)] = convert(text.strip())
    return cfg

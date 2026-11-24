import json

OFF = {"0", "false", "no", "off", ""}


def convert(sample, text):
    if isinstance(sample, bool):
        return text.strip().lower() not in OFF
    if isinstance(sample, int):
        return int(text)
    return text


def load(path, env):
    with open(path) as handle:
        values = json.load(handle)
    for key, sample in list(values.items()):
        text = env.get("APP_" + key.upper())
        if text is not None:
            values[key] = convert(sample, text)
    return values

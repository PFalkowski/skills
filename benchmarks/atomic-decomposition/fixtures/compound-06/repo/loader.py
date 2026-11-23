from defaults import DEFAULTS
from migrate import upgrade

TRUE_WORDS = {"1", "true", "yes", "on"}


def to_bool(value):
    if isinstance(value, str):
        return value.strip().lower() in TRUE_WORDS
    return bool(value)


def load(raw):
    settings = dict(DEFAULTS)
    settings.update(upgrade(raw))
    settings["verbose"] = to_bool(settings["verbose"])
    del settings["version"]
    return settings

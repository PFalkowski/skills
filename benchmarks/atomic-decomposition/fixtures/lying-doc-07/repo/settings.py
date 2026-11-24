DEFAULTS = {"port": 8080, "debug": False, "name": "shop"}


def load(file_values, env):
    out = {**DEFAULTS, **file_values}
    for key, default in DEFAULTS.items():
        raw = env.get("APP_" + key.upper())
        if raw is not None:
            out[key] = type(default)(raw)
    return out

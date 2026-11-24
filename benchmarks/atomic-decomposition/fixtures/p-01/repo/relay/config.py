import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REQUIRED = ("recipient", "max_length")


class ConfigError(ValueError):
    pass


def read_json(name):
    path = ROOT / name
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        raise ConfigError(f"missing {name}") from None
    except json.JSONDecodeError as exc:
        raise ConfigError(f"{name}: {exc}") from None


def load_channels():
    data = read_json("channels.json")
    for name, entry in data.items():
        missing = [key for key in REQUIRED if key not in entry]
        if missing:
            raise ConfigError(f"channel {name} lacks {', '.join(missing)}")
        if not isinstance(entry["max_length"], int) or entry["max_length"] < 10:
            raise ConfigError(f"channel {name}: max_length must be an integer of at least 10")
    return data


def check(routes):
    from relay.channels import REGISTRY, load_all

    load_all()
    channels = load_channels()
    problems = []
    for name in channels:
        if name not in REGISTRY:
            problems.append(f"channels.json: no code for channel {name}")
    for severity, names in routes.items():
        for name in names:
            if name not in channels:
                problems.append(f"routes.json: {severity} uses unknown channel {name}")
    used = {name for names in routes.values() for name in names}
    for name in sorted(set(channels) - used):
        problems.append(f"channels.json: channel {name} is never used")
    repeat = channels.get("pager", {}).get("repeat", 1)
    if not isinstance(repeat, int) or repeat < 1:
        problems.append("channels.json: pager repeat must be a positive integer")
    return problems

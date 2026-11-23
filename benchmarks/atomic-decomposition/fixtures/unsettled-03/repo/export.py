import tomllib
from pathlib import Path


def load(path):
    with open(path, "rb") as f:
        return tomllib.load(f)


def rows(cfg):
    return [f"{name},{cfg['prices'][name]}" for name in sorted(cfg["prices"])]


if __name__ == "__main__":
    cfg = load(Path(__file__).with_name("config.toml"))
    print("\n".join(rows(cfg)))

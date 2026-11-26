import configparser
from dataclasses import dataclass
from pathlib import Path

from portfolio import filters
from portfolio.model import STATUS_NAMES

ROOT = Path(__file__).resolve().parent.parent
COLUMNS = ("id", "name", "owner", "status", "budget", "spent", "left", "used")


@dataclass(frozen=True)
class View:
    name: str
    columns: tuple
    statuses: tuple = ()
    sort: str = "name"


def split(text):
    return tuple(part.strip() for part in text.split(",") if part.strip())


def parse(name, section):
    columns = split(section.get("columns", ",".join(COLUMNS)))
    unknown = [c for c in columns if c not in COLUMNS]
    if unknown:
        raise ValueError(f"view {name}: unknown columns {unknown}")
    statuses = split(section.get("statuses", ""))
    bad = [s for s in statuses if s not in STATUS_NAMES.values()]
    if bad:
        raise ValueError(f"view {name}: unknown statuses {bad}")
    return View(name, columns, statuses, section.get("sort", "name"))


def load(path=ROOT / "views.ini"):
    config = configparser.ConfigParser()
    if not config.read(path, encoding="utf-8"):
        return {"default": View("default", COLUMNS)}
    views = {name: parse(name, config[name]) for name in config.sections()}
    views.setdefault("default", View("default", COLUMNS))
    return views


def apply(view, projects):
    if view.statuses:
        return filters.only_statuses(projects, view.statuses)
    return list(projects)

import configparser
import os
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEFAULTS = ROOT / "config" / "defaults.ini"
OVERRIDE_VARIABLE = "MEDIAHUB_CONFIG"
REPORTS = ("text", "json")


@dataclass(frozen=True)
class Settings:
    retention_days: int
    index: Path
    max_batch: int
    report: str
    quota_mb: int


class SettingsError(ValueError):
    pass


def read(parser, path):
    if not parser.read(path, encoding="utf-8"):
        raise SettingsError(f"cannot read settings file {path}")


def positive(section, key):
    try:
        value = section.getint(key)
    except ValueError:
        raise SettingsError(f"{key} must be a whole number") from None
    if value is None or value < 1:
        raise SettingsError(f"{key} must be at least 1")
    return value


def load(environ=os.environ):
    parser = configparser.ConfigParser()
    read(parser, DEFAULTS)
    override = environ.get(OVERRIDE_VARIABLE)
    if override:
        read(parser, override)
    section = parser["cleanup"]
    report = section.get("report", "text")
    if report not in REPORTS:
        raise SettingsError(f"report must be one of {REPORTS}")
    path = Path(section.get("index"))
    return Settings(positive(section, "retention_days"),
                    path if path.is_absolute() else ROOT / path,
                    positive(section, "max_batch"), report, positive(section, "quota_mb"))

import json
from pathlib import Path

DEFAULTS = json.loads((Path(__file__).parent / "defaults.json").read_text())

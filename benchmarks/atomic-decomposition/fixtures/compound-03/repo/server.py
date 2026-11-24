from aliases import canonical
from handlers import HANDLERS


def handle(line):
    parts = line.split()
    if not parts:
        return {"ok": False, "error": "empty request"}
    fn = HANDLERS.get(canonical(parts[0]))
    if fn is None:
        return {"ok": False, "error": "unknown command " + parts[0]}
    try:
        return {"ok": True, "result": fn(*parts[1:])}
    except KeyError:
        return {"ok": False, "error": "missing key"}

from relay.routing import SEVERITIES
from relay.templates import clean

ORDER = {severity: rank for rank, severity in enumerate(SEVERITIES)}


def read_alerts(path):
    alerts = []
    with open(path, encoding="utf-8") as handle:
        for number, line in enumerate(handle, 1):
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            severity, sep, text = line.partition(" ")
            if not sep or severity not in ORDER:
                raise ValueError(f"{path}:{number}: expected '<severity> <text>'")
            alerts.append((severity, clean(text)))
    return alerts


def summarise(alerts):
    groups = {}
    for severity, text in alerts:
        groups.setdefault(severity, []).append(text)
    result = []
    for severity in sorted(groups, key=ORDER.get, reverse=True):
        texts = groups[severity]
        if len(texts) == 1:
            result.append((severity, texts[0]))
        else:
            lines = [f"{len(texts)} alerts"] + [f"- {text}" for text in texts]
            result.append((severity, "\n".join(lines)))
    return result

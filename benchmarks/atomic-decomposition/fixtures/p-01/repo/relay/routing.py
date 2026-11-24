from relay.config import ConfigError, read_json

SEVERITIES = ("low", "normal", "high", "critical")
QUIET = ("22:00", "07:00")
QUIET_CHANNELS = ("chat", "email")


def load_routes():
    routes = read_json("routes.json")
    unknown = set(routes) - set(SEVERITIES)
    if unknown:
        raise ConfigError(f"unknown severities in routes.json: {sorted(unknown)}")
    return routes


def minutes(clock):
    hours, _, mins = clock.partition(":")
    if not (hours.isdigit() and mins.isdigit()) or int(hours) > 23 or int(mins) > 59:
        raise ValueError(f"bad time {clock!r}, expected HH:MM")
    return int(hours) * 60 + int(mins)


def is_quiet(at):
    if at is None:
        return False
    now, start, end = minutes(at), minutes(QUIET[0]), minutes(QUIET[1])
    return now >= start or now < end


def channels_for(severity, at=None):
    routes = load_routes()
    if severity not in routes:
        raise ConfigError(f"no route for severity {severity}")
    seen = []
    for name in routes[severity]:
        if name in seen:
            continue
        if severity in ("low", "normal") and name in QUIET_CHANNELS and is_quiet(at):
            continue
        seen.append(name)
    return seen

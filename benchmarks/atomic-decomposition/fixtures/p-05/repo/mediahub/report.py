import json

from mediahub import policy


def render(uploads, config, applied):
    verb = "removed" if applied else "would remove"
    if config.report == "json":
        data = {"action": verb, "retention_days": config.retention_days,
                "uploads": [u.id for u in uploads], "bytes": policy.freed(uploads)}
        return json.dumps(data) + "\n"
    lines = [f"{u.id}\t{u.owner}\t{u.name}\t{u.uploaded.isoformat()}" for u in uploads]
    lines.append(f"{verb} {len(uploads)} upload(s), {policy.freed(uploads)} bytes,"
                 f" retention {config.retention_days} days")
    return "\n".join(lines) + "\n"

import json
from pathlib import Path

from dues import billing, money

ROOT = Path(__file__).resolve().parent.parent
TODAY_MONTH = "2026-03"
FILTERS = {
    "overdue": lambda m: m.overdue,
    "card_expiring": lambda m: m.card_expires <= TODAY_MONTH,
    "everyone": lambda m: True,
}


def load(path=ROOT / "schedule.json"):
    schedule = json.loads(Path(path).read_text(encoding="utf-8"))
    for job in schedule:
        if job["filter"] not in FILTERS:
            raise ValueError(f"job {job['name']}: unknown filter {job['filter']}")
        if not hasattr(billing, job["action"]):
            raise ValueError(f"job {job['name']}: unknown action {job['action']}")
    return schedule


def arguments(job):
    if "fee" in job:
        return money.parse(job["fee"]), job["name"]
    return (job["text"],)


def run(job, roster, ledger):
    action = getattr(billing, job["action"])
    selected = [m for m in roster.all() if FILTERS[job["filter"]](m)]
    results = []
    for member in selected:
        result = action(member, *arguments(job), ledger)
        results.append(f"{job['name']}\t{member.id}\t{result if isinstance(result, str) else 'ok'}")
    return results


def due(job, day):
    return job.get("day") in (None, day)


def run_all(roster, ledger, day=1, schedule=None):
    if not 1 <= day <= 28:
        raise ValueError(f"jobs run on days 1 to 28, got {day}")
    lines = []
    for job in schedule if schedule is not None else load():
        if due(job, day):
            lines.extend(run(job, roster, ledger))
    return lines

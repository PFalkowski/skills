import json

from retry import run


def retries_for(name, path="jobs.json"):
    with open(path) as handle:
        config = json.load(handle)
    job = config["jobs"][name]
    return job.get("retries", config["default_retries"])


def run_job(name, fn):
    return run(fn, retries_for(name))

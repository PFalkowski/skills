from runner import run_job


def always_down():
    raise ConnectionError("down")


for name in ("nightly-sync", "hourly-ping"):
    print(name, run_job(name, always_down))

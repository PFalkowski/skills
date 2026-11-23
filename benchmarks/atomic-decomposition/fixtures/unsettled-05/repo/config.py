import os

DEFAULTS = {"retry_limit": 3}


def load():
    cfg = dict(DEFAULTS)
    if "MAILER_RETRY_LIMIT" in os.environ:
        cfg["retry_limit"] = int(os.environ["MAILER_RETRY_LIMIT"])
    return cfg

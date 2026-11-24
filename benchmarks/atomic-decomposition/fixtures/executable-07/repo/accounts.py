import hashlib

from defaults import DEFAULTS


def home_channel(user):
    digest = int(hashlib.sha256(user.encode()).hexdigest(), 16)
    return DEFAULTS["routes"][digest % len(DEFAULTS["routes"])]


class Profile:
    def __init__(self, user, **overrides):
        self.user = user
        self.opts = {**DEFAULTS, **overrides}
        self.enable(home_channel(user))

    def enable(self, channel):
        if channel not in self.opts["channels"]:
            self.opts["channels"] += [channel]

from config import IDLE_MS, MAX_AGE_S


class Session:
    def __init__(self, now):
        self.created = now
        self.seen = now

    def touch(self, now):
        self.seen = now

    def expired(self, now):
        if now - self.seen > IDLE_MS:
            return True
        return now - self.created > MAX_AGE_S

from collections import Counter

LIMITS = (50, 200, 1000)


def bucket(ms):
    for index, limit in enumerate(LIMITS):
        if ms <= limit:
            return index
    return len(LIMITS)


class Summary:
    def __init__(self):
        self.classes = Counter()
        self.buckets = Counter()
        self.count = 0
        self.mean_ms = 0.0
        self.slowest = 0

    def add(self, status, ms):
        self.classes[max(0, min(status // 100, 5))] += 1
        self.buckets[bucket(ms)] += 1
        self.count += 1
        self.mean_ms += (ms - self.mean_ms) / self.count
        self.slowest = max(self.slowest, ms)

    def merge(self, other):
        self.classes.update(other.classes)
        self.buckets.update(other.buckets)
        if self.count and other.count:
            self.mean_ms = (self.mean_ms + other.mean_ms) / 2
        elif other.count:
            self.mean_ms = other.mean_ms
        self.count += other.count
        self.slowest = max(self.slowest, other.slowest)

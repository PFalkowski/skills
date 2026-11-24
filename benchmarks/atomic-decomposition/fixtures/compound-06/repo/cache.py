import threading
from collections import OrderedDict


class Stats:
    def __init__(self):
        self.hits = 0
        self.misses = 0


class Cache:
    def __init__(self, limit):
        self.limit = limit
        self.items = OrderedDict()
        self.stats = Stats()
        self.lock = threading.RLock()

    def get(self, key, load):
        with self.lock:
            if key in self.items:
                self.items.move_to_end(key)
                self.stats.hits += 1
                return self.items[key]
            self.stats.misses += 1
        value = load(key)
        with self.lock:
            self.items[key] = value
            self.items.move_to_end(key)
            while len(self.items) > self.limit:
                self.items.popitem(last=False)
        return value

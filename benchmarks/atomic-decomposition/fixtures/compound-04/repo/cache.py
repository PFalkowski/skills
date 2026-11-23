import threading
from collections import OrderedDict


class Cache:
    def __init__(self, max_size):
        self._max = max_size
        self._data = OrderedDict()
        self._lock = threading.RLock()
        self._hits = 0
        self._misses = 0

    def _evict(self):
        while len(self._data) > self._max:
            self._data.popitem(last=False)

    def get(self, key, default=None):
        with self._lock:
            if key in self._data:
                self._hits += 1
                self._data.move_to_end(key)
                return self._data[key]
            self._misses += 1
            return default

    def get_many(self, keys):
        with self._lock:
            return [self.get(key) for key in keys]

    def put(self, key, value):
        with self._lock:
            self._data[key] = value
            self._data.move_to_end(key)
            self._evict()

    def stats(self):
        with self._lock:
            return self._hits, self._misses, len(self._data)

    def clear(self):
        with self._lock:
            self._data.clear()

    def __len__(self):
        with self._lock:
            return len(self._data)

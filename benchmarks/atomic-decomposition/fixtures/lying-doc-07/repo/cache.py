from collections import OrderedDict


class Cache:
    def __init__(self, capacity):
        self.capacity = capacity
        self.items = OrderedDict()

    def get(self, key):
        if key not in self.items:
            return None
        self.items.move_to_end(key)
        return self.items[key]

    def put(self, key, value):
        if key not in self.items and len(self.items) >= self.capacity:
            self.items.popitem(last=False)
        self._store(key, value)

    def _store(self, key, value):
        is_new = key not in self.items
        self.items[key] = value
        if is_new:
            self.items.move_to_end(key)

    def keys(self):
        return list(self.items)

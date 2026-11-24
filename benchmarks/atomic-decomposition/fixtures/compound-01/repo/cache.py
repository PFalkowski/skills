from collections import OrderedDict


class Cache:
    def __init__(self, loader, capacity=2):
        self.loader = loader
        self.capacity = capacity
        self.items = OrderedDict()
        self.loads = 0

    def get(self, key):
        if key in self.items:
            self.items.move_to_end(key)
        else:
            self.loads += 1
            self.items[key] = self.loader(key)
            if len(self.items) > self.capacity:
                self.items.popitem(last=False)
        return list(self.items[key])

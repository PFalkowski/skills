class Store:
    def __init__(self, levels):
        self._levels = dict(levels)
        self.reserved = {}

    def stock_of(self, sku):
        return self._levels[sku]

    def reserve(self, sku, qty):
        self.reserved[sku] = self.reserved.get(sku, 0) + qty

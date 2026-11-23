from catalog import PRICES, new_lines


class Basket:
    def __init__(self, owner):
        self.owner = owner
        self.lines = new_lines("basket")

    def add(self, sku, qty=1):
        self.lines.append((sku, qty))

    def total(self):
        return sum(PRICES[sku] * qty for sku, qty in self.lines)

from labels import canon


class Hall:
    def __init__(self):
        self.booked = {}
        self.held = {}

    def hold(self, user, label):
        k = canon(label)
        if k in self.booked or k in self.held:
            raise ValueError("taken")
        self.held[k] = user

    def book(self, user, label):
        k = canon(label)
        if k in self.booked:
            raise ValueError("taken")
        if self.held.get(k, user) != user:
            raise ValueError("held")
        self.held.pop(k, None)
        self.booked[k] = user

    def cancel(self, user, label):
        k = canon(label)
        if self.booked.get(k) == user:
            del self.booked[k]

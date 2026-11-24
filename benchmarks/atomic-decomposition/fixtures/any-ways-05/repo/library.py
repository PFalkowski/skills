LIMIT = 4


class Library:
    def __init__(self):
        self.loans = {}
        self.queue = {}

    def borrow(self, member, book):
        held = self.loans.setdefault(member, set())
        if len(held) >= LIMIT:
            raise ValueError("limit reached")
        if any(book in books for books in self.loans.values()):
            self.queue.setdefault(book, []).append(member)
            return "queued"
        held.add(book)
        return "borrowed"

    def give_back(self, member, book):
        self.loans[member].discard(book)
        waiting = self.queue.get(book, [])
        if waiting:
            nxt = waiting.pop(0)
            self.loans.setdefault(nxt, set()).add(book)

    def count(self, member):
        return len(self.loans.get(member, ()))

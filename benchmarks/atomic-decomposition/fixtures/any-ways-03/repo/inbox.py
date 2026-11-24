class Inbox:
    def __init__(self, max_deliveries):
        self.items = []
        self.max = max_deliveries
        self.log = []

    def put(self, msg):
        self.items.append((msg, 1))

    def drain(self, handle):
        while self.items:
            msg, n = self.items.pop(0)
            ok = handle(msg)
            self.log.append((msg, n, ok))
            if not ok and n < self.max:
                self.items.append((msg, n + 1))

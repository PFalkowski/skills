class Writer:
    def __init__(self, batch):
        self.batch = batch
        self.out = []
        self.seen = set()

    def write(self, rows):
        for i in range(0, len(rows), self.batch):
            for row in rows[i:i + self.batch]:
                if row["id"] in self.seen:
                    continue
                self.seen.add(row["id"])
                self.out.append(row)
            self.commit()

    def commit(self):
        self.seen.clear()

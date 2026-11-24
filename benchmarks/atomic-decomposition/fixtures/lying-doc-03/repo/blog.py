from slug import make


class Blog:
    def __init__(self):
        self.taken = set()

    def publish(self, title):
        base = make(title)
        slug = base
        n = 2
        while slug in self.taken:
            slug = f"{base}-{n}"
            n += 1
        self.taken.add(slug)
        return slug

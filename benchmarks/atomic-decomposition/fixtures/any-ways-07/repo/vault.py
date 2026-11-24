MIN_LEN = 8


class Vault:
    def __init__(self):
        self.codes = set()

    def add(self, code):
        code = code.strip()
        if len(code) < MIN_LEN:
            raise ValueError("too short")
        self.codes.add(code)

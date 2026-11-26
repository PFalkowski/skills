ELLIPSIS = "..."


class Channel:
    name = "base"

    def __init__(self, settings, outbox):
        self.recipient = settings["recipient"]
        self.max_length = settings["max_length"]
        self.settings = settings
        self.outbox = outbox

    def decorate(self, text):
        return text

    def fit(self, text):
        if len(text) <= self.max_length:
            return text
        return text[: self.max_length - len(ELLIPSIS)] + ELLIPSIS

    def deliver(self, body, attempt=1):
        return self.outbox.put(self.name, self.recipient, body, attempt)

    def send(self, text):
        return [self.deliver(self.fit(self.decorate(text)))]

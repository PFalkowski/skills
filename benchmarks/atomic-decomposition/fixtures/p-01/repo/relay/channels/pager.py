from relay.channels import register
from relay.channels.base import Channel

URGENT_TAG = "[URGENT] "


@register("pager")
class PagerChannel(Channel):
    def send(self, text):
        body = self.fit(" ".join(text.split()))
        deliveries = []
        for attempt in range(1, self.settings.get("repeat", 1) + 1):
            if self.outbox.is_acknowledged(self.recipient):
                break
            deliveries.append(self.deliver(URGENT_TAG + body, attempt))
        return deliveries

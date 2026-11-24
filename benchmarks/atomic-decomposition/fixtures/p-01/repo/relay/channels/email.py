from relay.channels import register
from relay.channels.base import Channel


@register("email")
class EmailChannel(Channel):
    def decorate(self, text):
        signature = self.settings.get("signature")
        return f"{text}\n\n{signature}" if signature else text

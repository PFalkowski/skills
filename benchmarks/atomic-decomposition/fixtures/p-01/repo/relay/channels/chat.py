from relay.channels import register
from relay.channels.base import Channel


@register("chat")
class ChatChannel(Channel):
    def decorate(self, text):
        return text.replace("\n", " / ")

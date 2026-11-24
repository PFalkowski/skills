import unicodedata

from relay.channels import register
from relay.channels.base import Channel


def to_ascii(text):
    flat = unicodedata.normalize("NFKD", text)
    return flat.encode("ascii", "ignore").decode("ascii")


@register("sms")
class SmsChannel(Channel):
    def decorate(self, text):
        return to_ascii(" ".join(text.split()))

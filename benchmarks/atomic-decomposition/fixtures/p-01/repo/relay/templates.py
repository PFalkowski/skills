import re

SPACES = re.compile(r"[ \t]+")


def clean(text):
    lines = [SPACES.sub(" ", line).strip() for line in text.splitlines()]
    return "\n".join(line for line in lines if line)


def render(text, title=None):
    body = clean(text)
    if not body:
        raise ValueError("empty alert text")
    if title:
        return f"{clean(title).upper()}: {body}"
    return body

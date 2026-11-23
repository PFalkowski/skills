import string

WORD_CHARS = string.ascii_lowercase + string.digits


def is_word_char(ch):
    return ch in WORD_CHARS


def slugify(title):
    spaced = "".join(ch if is_word_char(ch) else " " for ch in title.lower())
    return "-".join(spaced.split())

import posixpath

ROOT = "/srv/files"
STORE = {}


def key_for(name):
    path = posixpath.normpath(posixpath.join(ROOT, name))
    if not path.startswith(ROOT + "/"):
        raise ValueError("outside root")
    return path


def save(name, data):
    STORE[key_for(name)] = data
    return len(data)

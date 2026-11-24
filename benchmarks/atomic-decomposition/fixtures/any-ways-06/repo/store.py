import posixpath

ROOT = "/srv/uploads"


def target(name):
    path = posixpath.normpath(posixpath.join(ROOT, name))
    if posixpath.commonpath([ROOT, path]) != ROOT:
        raise PermissionError(name)
    return path


def save(name, data, disk):
    disk[target(name)] = data


def rename(old, new, disk):
    disk[target(new)] = disk.pop(target(old))


def save_many(entries, disk):
    for name, data in entries:
        save(posixpath.normpath(name).lstrip("/"), data, disk)

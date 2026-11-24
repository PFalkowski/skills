DATASETS = {}


def slug(filename):
    return filename.strip(".txt").lower()


def register(filename, rows):
    name = slug(filename)
    DATASETS[name] = rows
    return name

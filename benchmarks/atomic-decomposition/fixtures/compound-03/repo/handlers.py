DATA = {}


def put(key, value=None):
    DATA[key] = value
    return value


def get(key, value=None):
    return DATA[key]


def delete(key, value=None):
    return DATA.pop(key)


HANDLERS = {"put": put, "get": get, "delete": delete}

from importlib import import_module

MODULES = ("chat", "email", "sms", "pager")
REGISTRY = {}


def register(name):
    def wrap(cls):
        cls.name = name
        REGISTRY[name] = cls
        return cls
    return wrap


def load_all():
    for module in MODULES:
        import_module(f"{__name__}.{module}")


def build(name, settings, outbox):
    if not REGISTRY:
        load_all()
    try:
        cls = REGISTRY[name]
    except KeyError:
        raise KeyError(f"unknown channel {name}") from None
    return cls(settings, outbox)

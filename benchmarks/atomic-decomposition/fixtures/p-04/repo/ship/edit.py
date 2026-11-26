FIELDS = {"recipient", "address", "postcode", "weight"}
LOCKED_WHEN_LABELLED = {"address", "postcode", "weight"}


def parse(pairs):
    changes = []
    for pair in pairs:
        key, sep, value = pair.partition("=")
        key = key.strip()
        if not sep or not key:
            raise ValueError(f"expected KEY=VALUE, got {pair!r}")
        changes.append((key, value.strip()))
    return changes


def apply(shipment, pairs):
    done = []
    for key, value in parse(pairs):
        if key in FIELDS:
            if shipment.labelled and key in LOCKED_WHEN_LABELLED:
                raise ValueError(f"{shipment.id} is labelled; {key} cannot change")
            setattr(shipment, key, float(value) if key == "weight" else value)
        elif value:
            shipment.extra[key] = value
        else:
            shipment.extra.pop(key, None)
        done.append(f"{shipment.id}: {key} set")
    return done

from ship import amend, edit, labels, postcodes
from ship.model import Shipment


class CommandError(Exception):
    pass


def need(store, shipment_id):
    shipment = store.get(shipment_id)
    if shipment is None:
        raise CommandError(f"no shipment {shipment_id}")
    return shipment


def do_list(store, args):
    return [s.summary() for s in store.all()]


def do_show(store, args):
    s = need(store, args.id)
    lines = [s.summary()]
    lines += [f"  {key}: {value}" for key, value in sorted(s.extra.items())]
    if s.labelled:
        lines += ["", labels.text(s)]
    return lines


def do_create(store, args):
    if not postcodes.valid(args.postcode):
        raise CommandError(f"bad postcode {args.postcode!r}")
    if not 0 < args.weight <= 30:
        raise CommandError("weight must be above 0 and at most 30 kg")
    s = store.add(Shipment(store.next_id(), args.recipient.strip(),
                           postcodes.clean_address(args.address), args.postcode, args.weight))
    return [f"created {s.id}"]


def do_label(store, args):
    s = need(store, args.id)
    cost = labels.buy(s, args.service)
    return [f"{s.id}: label {s.label} ({args.service}) {cost}"]


def do_address(store, args):
    s = need(store, args.id)
    if s.labelled:
        raise CommandError(f"{s.id} is labelled; the address on the label cannot change")
    if not postcodes.valid(args.postcode):
        raise CommandError(f"bad postcode {args.postcode!r}")
    s.address, s.postcode = postcodes.clean_address(args.address), args.postcode
    return [f"{s.id}: address set"]


def do_amend(store, args):
    result = amend.apply_file(store, args.path)
    return [f"imported {args.path}: {result.seen} row(s)"]


def do_edit(store, args):
    return edit.apply(need(store, args.id), args.set)


def do_relabel(store, args):
    s = need(store, args.id)
    cost = labels.reprint(s, args.service)
    return [f"{s.id}: label {s.label} reprinted {cost}"]


def do_track(store, args):
    s = need(store, args.id)
    if not s.labelled:
        return [f"{s.id}: not labelled yet"]
    return [f"{s.id}: {event}" for event in s.events] or [f"{s.id}: no scans yet"]


HANDLERS = {"list": do_list, "show": do_show, "create": do_create, "label": do_label,
            "address": do_address, "amend": do_amend, "edit": do_edit,
            "relabel": do_relabel, "track": do_track}


def run(store, args):
    try:
        return HANDLERS[args.command](store, args)
    except ValueError as exc:
        raise CommandError(str(exc)) from None

from rules import check_weight
from rates import quote


def make_label(p):
    check_weight(p)
    return "%s %s %d" % (p["to"], p["service"], quote(p["kg"]))

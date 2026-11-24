from pricing import cents, line_amount, total


def render(lines):
    rows = ["%s x%d %s" % (p, q, cents(line_amount(p, q))) for p, q in lines]
    rows.append("total %s" % total(lines))
    return "\n".join(rows)

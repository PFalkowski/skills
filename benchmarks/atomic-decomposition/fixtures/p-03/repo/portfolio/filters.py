def by_owner(projects, owner):
    wanted = " ".join(owner.split()).lower()
    return [p for p in projects if p.owner.lower() == wanted]


def exclude_statuses(projects, names):
    codes = set(names)
    return [p for p in projects if p.status_code not in codes]


def only_statuses(projects, names):
    wanted = {name.strip().lower() for name in names}
    return [p for p in projects if p.status in wanted]


def over_budget(projects):
    return [p for p in projects if p.spent > p.budget]

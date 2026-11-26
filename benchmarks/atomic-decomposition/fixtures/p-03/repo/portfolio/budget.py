def totals(projects):
    budget = sum(p.budget for p in projects)
    spent = sum(p.spent for p in projects)
    return {"budget": budget, "spent": spent, "left": budget - spent}


def by_owner(projects):
    result = {}
    for p in projects:
        entry = result.setdefault(p.owner, {"budget": 0, "spent": 0, "projects": 0})
        entry["budget"] += p.budget
        entry["spent"] += p.spent
        entry["projects"] += 1
    return dict(sorted(result.items()))


def nearly_spent(projects, threshold=95):
    return [p for p in projects if p.budget and p.used >= threshold and p.left >= 0]

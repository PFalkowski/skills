def over_budget(project):
    if project.spent > project.budget:
        return f"{project.id}: spent {project.spent:,} of a {project.budget:,} budget"
    return None


def proposed_with_spending(project):
    if project.status == "proposed" and project.spent:
        return f"{project.id}: proposed but has spent {project.spent:,}"
    return None


def paused_and_spent(project):
    if project.status == "paused" and project.budget and project.left == 0:
        return f"{project.id}: paused with no budget left"
    return None


def owner_missing(project):
    if not project.owner:
        return f"{project.id}: no owner"
    return None


RULES = (over_budget, proposed_with_spending, paused_and_spent, owner_missing)


def run(projects):
    problems = []
    for project in projects:
        for rule in RULES:
            message = rule(project)
            if message:
                problems.append(message)
    return problems

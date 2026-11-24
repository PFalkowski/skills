def next_up(tasks):
    return sorted(tasks, key=lambda t: t["priority"], reverse=True)

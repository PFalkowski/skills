def run(job, retries=3, base=1, cap=10):
    waits = []
    for attempt in range(1, retries + 2):
        if job(attempt):
            return attempt, waits
        if attempt <= retries:
            waits.append(min(base * 2 ** (attempt - 1), cap))
    return None, waits

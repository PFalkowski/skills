def run(fn, retries):
    attempts = 0
    for _ in range(retries + 1):
        attempts += 1
        try:
            return {"ok": True, "attempts": attempts, "value": fn()}
        except ConnectionError:
            pass
    return {"ok": False, "attempts": attempts}

from retry import HttpError, call_with_retry


def scripted(statuses):
    queue = list(statuses)
    calls = []

    def fn():
        calls.append(1)
        status = queue.pop(0)
        if status != 200:
            raise HttpError(status)
        return "ok"

    return fn, calls


def scenario(statuses):
    fn, calls = scripted(statuses)
    waits = []
    try:
        result = call_with_retry(fn, waits.append)
    except HttpError as e:
        result = "error %d" % e.status
    print(statuses, result, len(calls), waits)


scenario([503, 503, 503, 200])
scenario([503, 503, 503, 503])
scenario([404, 200])
scenario([401, 200])

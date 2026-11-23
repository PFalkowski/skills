def send(message, transport, cfg):
    attempts = 0
    while attempts < cfg["retry_limit"]:
        attempts += 1
        try:
            transport(message)
            return attempts
        except ConnectionError:
            continue
    return attempts

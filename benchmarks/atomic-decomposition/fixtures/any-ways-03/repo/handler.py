RETRIES = 1


def deliver(msg, send):
    for _ in range(RETRIES):
        try:
            send(msg)
            return True
        except ConnectionError:
            continue
    return False

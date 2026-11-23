def purge(sessions, now):
    return [s for s in sessions if not s.expired(now)]

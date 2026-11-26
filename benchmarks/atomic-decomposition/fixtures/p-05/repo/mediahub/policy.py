from mediahub import dates


def expired(uploads, today, retention_days):
    old = [u for u in uploads if dates.age_in_days(u.uploaded, today) > retention_days]
    return sorted(old, key=lambda u: (u.uploaded, u.id))


def freed(uploads):
    return sum(u.size for u in uploads)

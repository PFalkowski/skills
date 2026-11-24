MB = 1024 * 1024


def usage(uploads):
    totals = {}
    for upload in uploads:
        totals[upload.owner] = totals.get(upload.owner, 0) + upload.size
    return totals


def over(uploads, quota_mb):
    limit = quota_mb * MB
    return sorted((owner, used) for owner, used in usage(uploads).items() if used > limit)


def headroom(uploads, owner, quota_mb):
    return quota_mb * MB - usage(uploads).get(owner, 0)

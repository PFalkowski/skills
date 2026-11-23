from datetime import timedelta


def week_counts(events, first_monday, weeks):
    counts = []
    for i in range(weeks):
        start = first_monday + timedelta(days=7 * i)
        end = start + timedelta(days=7)
        counts.append(sum(1 for d in events if start <= d < end))
    return counts

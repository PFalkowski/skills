from events import EVENTS
from settings import FIRST_MONDAY, WEEKS
from weekly import week_counts

counts = week_counts(EVENTS, FIRST_MONDAY, WEEKS)
print(counts, sum(counts), len(EVENTS))

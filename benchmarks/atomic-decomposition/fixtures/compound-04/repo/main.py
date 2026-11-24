from datetime import date

from calendar_data import HOLIDAYS
from workdays import add_workdays

for start, count in [(date(2026, 12, 24), 1), (date(2026, 12, 26), 0), (date(2026, 12, 23), 2)]:
    print(start, count, add_workdays(start, count, HOLIDAYS))

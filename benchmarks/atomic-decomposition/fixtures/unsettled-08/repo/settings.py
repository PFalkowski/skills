import os
from datetime import date

FIRST_MONDAY = date.fromisoformat(os.environ.get("SUMMARY_START", "2025-01-06"))
WEEKS = int(os.environ.get("SUMMARY_WEEKS", "3"))

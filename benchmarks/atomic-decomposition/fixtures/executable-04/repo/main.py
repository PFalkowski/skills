from data import TASKS
from tasks import next_up

for task in next_up(TASKS):
    print(task["priority"], task["name"])

import os

from settings import load

path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "settings.json")
print(load(path, os.environ))

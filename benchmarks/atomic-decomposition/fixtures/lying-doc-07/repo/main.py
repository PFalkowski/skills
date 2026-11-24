import json

from settings import load

with open("sample.json") as f:
    file_values = json.load(f)

print(load(file_values, {}))
print(load(file_values, {"APP_PORT": "9000"}))

from loader import load

SAMPLES = [
    {"timeout": 10, "verbose": "yes"},
    {"version": 2, "timeout_s": 5, "retries": 1, "verbose": False},
    {"timeout": 60, "retries": 0},
]

for sample in SAMPLES:
    print(sorted(load(sample).items()))

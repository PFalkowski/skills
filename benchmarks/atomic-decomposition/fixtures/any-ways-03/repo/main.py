from label import make_label

for p in [
    {"to": "Oslo", "service": "standard", "kg": 12},
    {"to": "Oslo", "service": "standard", "kg": 31},
]:
    try:
        print(make_label(p))
    except ValueError as e:
        print("refused:", e)

from receipt import render

ITEMS = [
    ("bread", "1.20", 1),
    ("tea bag", "0.125", 2),
    ("candy", "0.375", 4),
]

print(render(ITEMS))

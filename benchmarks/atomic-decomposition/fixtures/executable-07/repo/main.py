from intake import accept

raw = "AB123\nCD45\nEF678"
print(accept(raw.splitlines(True)))

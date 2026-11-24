from cache import Cache
from loaders import load_rows

cache = Cache(load_rows, capacity=2)
for key in ["a", "b", "a", "c", "a", "b"]:
    rows = cache.get(key)
    print(key, len(rows), cache.loads)
print(list(cache.items))

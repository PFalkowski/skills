from cache import Cache

cache = Cache(2)
cache.put("a", 1)
cache.put("b", 2)
cache.get("a")
cache.put("c", 3)
print(cache.keys())

import threading

from cache import Cache

cache = Cache(3)
results = {}


def work(name, keys):
    results[name] = [cache.get(k, lambda k: k * 2) for k in keys]


threads = [
    threading.Thread(target=work, args=("a", [1, 2, 3])),
    threading.Thread(target=work, args=("b", [4, 5, 6])),
]
for t in threads:
    t.start()
    t.join()

print(results["a"], results["b"])
print(sorted(cache.items))
print(cache.get(6, lambda k: -1))
print(cache.stats.hits, cache.stats.misses)

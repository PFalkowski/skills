import threading

from cache import Cache

THREADS = 4
ROUNDS = 2000


def worker(cache, seed, counts, slot):
    lookups = 0
    for step in range(ROUNDS):
        key = (seed * 7 + step) % 50
        cache.put(key, step)
        cache.get(key + 1)
        lookups += 1
        if step % 10 == 0:
            cache.get_many([key, key + 2, key + 4])
            lookups += 3
    counts[slot] = lookups


def run(max_size):
    cache = Cache(max_size)
    counts = [0] * THREADS
    threads = [
        threading.Thread(target=worker, args=(cache, n, counts, n))
        for n in range(THREADS)
    ]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    hits, misses, size = cache.stats()
    return sum(counts), hits + misses, size

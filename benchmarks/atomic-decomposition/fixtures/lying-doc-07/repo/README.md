# Small cache

A least-recently-used cache with a fixed capacity.
Both `get` and `put` mark a key as most recently used.
When the cache is full, `put` of a new key drops the least recently used key.
Run `python3 main.py` for a demo.

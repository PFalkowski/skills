# Retry

`retry(fn, attempts=3, base=1)` calls `fn` up to `attempts` times.
After every failed try n (counting from 0) it sleeps `base * 2**n`
seconds and then tries again. When all tries have failed, the last
error is raised.
